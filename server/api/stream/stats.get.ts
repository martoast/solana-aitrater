/**
 * GET /api/stream/stats
 * 
 * Get real-time stats for a token.
 * Uses local stream data if available, falls back to DexScreener.
 * 
 * Query params:
 * - address: Token mint address (required)
 */

import { defineEventHandler, getQuery, createError } from 'h3';
import { 
  computeTokenStats,
  hasData,
  getSolPrice,
  getCandles,
} from '../../utils/candle-engine';
import { getTradeStats, getUniqueTraders, getTrades } from '../../utils/trade-store';

// Bootstrap from DexScreener for tokens not in stream
async function fetchFromDexScreener(address: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${address}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return null;
    
    const pairs = await response.json();
    
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    
    // Find pair with highest liquidity
    const pair = pairs.reduce((best: any, current: any) => {
      const bestLiq = best?.liquidity?.usd || 0;
      const currentLiq = current?.liquidity?.usd || 0;
      return currentLiq > bestLiq ? current : best;
    }, pairs[0]);
    
    if (!pair) return null;
    
    const now = Date.now();
    const pairAge = pair.pairCreatedAt ? now - pair.pairCreatedAt : 0;
    
    return {
      price: parseFloat(pair.priceUsd) || 0,
      priceNative: parseFloat(pair.priceNative) || 0,
      priceChange1m: pair.priceChange?.m5 ? pair.priceChange.m5 / 5 : 0,
      priceChange5m: pair.priceChange?.m5 || 0,
      priceChange1h: pair.priceChange?.h1 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      volume1m: pair.volume?.m5 ? pair.volume.m5 / 5 : 0,
      volume5m: pair.volume?.m5 || 0,
      volume1h: pair.volume?.h1 || 0,
      volume24h: pair.volume?.h24 || 0,
      txns1m: {
        buys: Math.round((pair.txns?.m5?.buys || 0) / 5),
        sells: Math.round((pair.txns?.m5?.sells || 0) / 5),
      },
      txns5m: pair.txns?.m5 || { buys: 0, sells: 0 },
      txns1h: pair.txns?.h1 || { buys: 0, sells: 0 },
      txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
      liquidity: pair.liquidity?.usd || 0,
      fdv: pair.fdv || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      pairAddress: pair.pairAddress,
      pairCreatedAt: pair.pairCreatedAt,
      ageMs: pairAge,
      ageMinutes: Math.floor(pairAge / 60000),
      source: 'dexscreener-bootstrap',
      dataQuality: 'limited',
      symbol: pair.baseToken?.symbol || '',
      name: pair.baseToken?.name || '',
      logoURI: pair.info?.imageUrl || null,
      lastUpdate: now,
    };
  } catch (e) {
    console.error('[StatsAPI] DexScreener fetch error:', e);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const address = query.address as string;
  
  if (!address) {
    throw createError({
      statusCode: 400,
      message: 'Missing required parameter: address',
    });
  }
  
  const solPrice = getSolPrice();
  
  // Check if we have local stream data
  if (hasData(address)) {
    const stats = computeTokenStats(address);
    
    if (stats) {
      // Get trade stats for different windows
      const tradeStats1m = getTradeStats(address, 60000);
      const tradeStats5m = getTradeStats(address, 300000);
      const tradeStats1h = getTradeStats(address, 3600000);
      
      // Get unique traders
      const uniqueTraders1m = getUniqueTraders(address, 60000);
      const uniqueTraders5m = getUniqueTraders(address, 300000);
      
      // Get recent trades count
      const recentTrades = getTrades(address, 100);
      
      // Get candle summaries
      const candles1m = getCandles(address, '1m');
      const candles5m = getCandles(address, '5m');
      
      return {
        success: true,
        data: {
          address,
          price: stats.price,
          priceNative: stats.priceNative,
          priceChange1m: stats.priceChange1m,
          priceChange5m: stats.priceChange5m,
          priceChange1h: stats.priceChange1h,
          volume1m: stats.volume1m,
          volume5m: stats.volume5m,
          volume1mUsd: stats.volume1m * solPrice,
          volume5mUsd: stats.volume5m * solPrice,
          txns1m: {
            buys: tradeStats1m.buys,
            sells: tradeStats1m.sells,
            total: tradeStats1m.buys + tradeStats1m.sells,
          },
          txns5m: {
            buys: tradeStats5m.buys,
            sells: tradeStats5m.sells,
            total: tradeStats5m.buys + tradeStats5m.sells,
          },
          txns1h: {
            buys: tradeStats1h.buys,
            sells: tradeStats1h.sells,
            total: tradeStats1h.buys + tradeStats1h.sells,
          },
          buyPressure1m: tradeStats1m.buys + tradeStats1m.sells > 0
            ? tradeStats1m.buys / (tradeStats1m.buys + tradeStats1m.sells)
            : 0.5,
          buyPressure5m: tradeStats5m.buys + tradeStats5m.sells > 0
            ? tradeStats5m.buys / (tradeStats5m.buys + tradeStats5m.sells)
            : 0.5,
          netFlow1m: tradeStats1m.netFlow,
          netFlow5m: tradeStats5m.netFlow,
          uniqueTraders1m,
          uniqueTraders5m,
          candleCount1m: candles1m.length,
          candleCount5m: candles5m.length,
          recentTradesCount: recentTrades.length,
          source: 'local-stream',
          dataQuality: 'full',
          lastUpdate: stats.lastUpdate,
        },
        meta: {
          solPrice,
          hasLocalData: true,
        },
      };
    }
  }
  
  // Fallback to DexScreener
  const dexData = await fetchFromDexScreener(address);
  
  if (dexData) {
    return {
      success: true,
      data: {
        address,
        ...dexData,
      },
      meta: {
        solPrice,
        hasLocalData: false,
        note: 'Token not in stream. Using DexScreener data.',
      },
    };
  }
  
  // No data found anywhere
  return {
    success: false,
    error: 'Token not found',
    data: null,
    meta: {
      solPrice,
      hasLocalData: false,
      note: 'Token not found in stream or DexScreener.',
    },
  };
});