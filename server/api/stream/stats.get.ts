/**
 * GET /api/stream/stats
 * 
 * Get computed stats for a token (replaces BirdEye/DexScreener).
 * Returns data in a format compatible with the scoring engine.
 */

import { defineEventHandler, getQuery, createError } from 'h3';
import { 
  getComputedStats, 
  getCurrentPrice, 
  hasData,
  getSolPrice,
} from '../../utils/candle-engine';
import { getTradeStats, getUniqueTraders, hasTrades } from '../../utils/trade-store';

// Bootstrap from DexScreener for cold start
async function bootstrapFromDexScreener(address: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const json = await res.json();
    const pairs = json.pairs || [];
    
    const solanaPair = pairs.find((p: any) => p.chainId === 'solana');
    if (!solanaPair) return null;

    const txns = solanaPair.txns || {};
    const priceChange = solanaPair.priceChange || {};
    const volume = solanaPair.volume || {};
    const txns5m = txns.m5 || { buys: 0, sells: 0 };
    const txns1h = txns.h1 || { buys: 0, sells: 0 };

    return {
      address,
      timestamp: Date.now(),
      source: 'dexscreener-bootstrap',
      
      price: parseFloat(solanaPair.priceUsd || 0),
      
      // Approximate 1m from 5m
      priceChange1m: (priceChange.m5 || 0) / 5,
      priceChange5m: priceChange.m5 || 0,
      priceChange30m: (priceChange.h6 || 0) / 12,
      priceChange1h: priceChange.h1 || 0,
      priceChange24h: priceChange.h24 || 0,
      
      volume1m: (volume.m5 || 0) / 5,
      volume5m: volume.m5 || 0,
      volume30m: (volume.h6 || 0) / 12,
      volume1h: volume.h1 || 0,
      volume24h: volume.h24 || 0,
      
      buys1m: Math.round(txns5m.buys / 5),
      sells1m: Math.round(txns5m.sells / 5),
      buys5m: txns5m.buys,
      sells5m: txns5m.sells,
      buys1h: txns1h.buys,
      sells1h: txns1h.sells,
      
      trades1m: Math.round((txns5m.buys + txns5m.sells) / 5),
      trades5m: txns5m.buys + txns5m.sells,
      trades1h: txns1h.buys + txns1h.sells,
      
      liquidity: solanaPair.liquidity?.usd || 0,
      symbol: solanaPair.baseToken?.symbol || '',
      name: solanaPair.baseToken?.name || '',
      mc: solanaPair.marketCap || 0,
      fdv: solanaPair.fdv || 0,
      holder: 0,
      createdAt: solanaPair.pairCreatedAt || null,
      ageMinutes: solanaPair.pairCreatedAt 
        ? Math.round((Date.now() - solanaPair.pairCreatedAt) / 60000)
        : null,
    };
  } catch (e) {
    console.error('[Bootstrap] DexScreener error:', e);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const address = query.address as string;

  if (!address) {
    throw createError({
      statusCode: 400,
      message: 'Address is required',
    });
  }

  // Check if we have data for this token
  const hasLocalData = hasData(address) || hasTrades(address);

  // If no local data, try to bootstrap from DexScreener
  if (!hasLocalData) {
    try {
      const bootstrapData = await bootstrapFromDexScreener(address);
      if (bootstrapData) {
        return {
          success: true,
          source: 'dexscreener-bootstrap',
          data: bootstrapData,
        };
      }
    } catch (e) {
      // Continue with no data response
    }

    return {
      success: false,
      error: 'No data available yet. Token will be tracked when trades occur.',
      data: null,
    };
  }

  // Get computed stats from our candle engine
  const candleStats = getComputedStats(address);
  
  if (!candleStats) {
    return {
      success: false,
      error: 'Failed to compute stats',
      data: null,
    };
  }

  // Get additional trade stats
  const tradeStats1m = getTradeStats(address, 60_000);
  const tradeStats5m = getTradeStats(address, 300_000);
  const tradeStats1h = getTradeStats(address, 3_600_000);
  const uniqueTraders1h = getUniqueTraders(address, 3_600_000);

  // Format response to match expected TokenData format
  const result = {
    address,
    timestamp: Date.now(),
    source: 'local-stream',
    
    // Price
    price: candleStats.price,
    
    // Price changes
    priceChange1m: candleStats.priceChange1m,
    priceChange5m: candleStats.priceChange5m,
    priceChange30m: candleStats.priceChange30m,
    priceChange1h: candleStats.priceChange1h,
    priceChange24h: candleStats.priceChange24h,
    
    // Volume (in SOL)
    volume1m: candleStats.volume1m,
    volume5m: candleStats.volume5m,
    volume30m: candleStats.volume30m,
    volume1h: candleStats.volume1h,
    volume24h: candleStats.volume24h,
    
    // Buys/Sells
    buys1m: candleStats.buys1m,
    sells1m: candleStats.sells1m,
    buys5m: candleStats.buys5m,
    sells5m: candleStats.sells5m,
    buys1h: candleStats.buys1h,
    sells1h: candleStats.sells1h,
    
    // Trade counts
    trades1m: candleStats.trades1m,
    trades5m: candleStats.trades5m,
    trades1h: candleStats.trades1h,
    
    // Unique traders
    uniqueTraders1h,
    
    // SOL price for reference
    solPriceUsd: getSolPrice(),
    
    // These need metadata lookup (bootstrap provides them)
    liquidity: 0,
    symbol: '',
    name: '',
    mc: 0,
    fdv: 0,
    holder: 0,
    createdAt: null,
    ageMinutes: null,
  };

  return {
    success: true,
    source: 'local-stream',
    data: result,
  };
});