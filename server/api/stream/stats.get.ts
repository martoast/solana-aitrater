/**
 * GET /api/stream/stats
 *
 * Get real-time stats for a token.
 * Uses local stream data for price/txns, ALWAYS fetches DexScreener for liquidity/metadata.
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

// Cache for DexScreener metadata (liquidity, age, symbol, etc.)
const dexMetadataCache = new Map<string, { data: any; timestamp: number }>();
const DEX_CACHE_TTL_MS = 30_000; // 30 second cache for metadata

// Fetch metadata (liquidity, age, symbol) from DexScreener
async function fetchDexScreenerMetadata(address: string): Promise<any | null> {
  // Check cache first
  const cached = dexMetadataCache.get(address);
  if (cached && Date.now() - cached.timestamp < DEX_CACHE_TTL_MS) {
    return cached.data;
  }

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

    const data = {
      liquidity: pair.liquidity?.usd || 0,
      fdv: pair.fdv || 0,
      marketCap: pair.marketCap || pair.fdv || 0,
      pairAddress: pair.pairAddress,
      pairCreatedAt: pair.pairCreatedAt,
      ageMs: pairAge,
      ageMinutes: Math.floor(pairAge / 60000),
      symbol: pair.baseToken?.symbol || '',
      name: pair.baseToken?.name || '',
      logoURI: pair.info?.imageUrl || null,
      holder: pair.holders || 0,
      // Also include DexScreener price data as fallback
      dexPrice: parseFloat(pair.priceUsd) || 0,
      dexPriceChange5m: pair.priceChange?.m5 || 0,
      dexPriceChange1h: pair.priceChange?.h1 || 0,
      dexPriceChange24h: pair.priceChange?.h24 || 0,
      dexVolume1h: pair.volume?.h1 || 0,
      dexVolume24h: pair.volume?.h24 || 0,
      dexTxns1h: pair.txns?.h1 || { buys: 0, sells: 0 },
    };

    // Cache the result
    dexMetadataCache.set(address, { data, timestamp: now });

    // Limit cache size
    if (dexMetadataCache.size > 500) {
      const entries = Array.from(dexMetadataCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 100; i++) {
        dexMetadataCache.delete(entries[i][0]);
      }
    }

    return data;
  } catch (e) {
    console.error('[StatsAPI] DexScreener metadata fetch error:', e);
    return null;
  }
}

// Full DexScreener fetch when no local stream data
async function fetchFullFromDexScreener(address: string): Promise<any | null> {
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
      source: 'dexscreener',
      dataQuality: 'limited',
      symbol: pair.baseToken?.symbol || '',
      name: pair.baseToken?.name || '',
      logoURI: pair.info?.imageUrl || null,
      holder: pair.holders || 0,
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

  // ALWAYS fetch DexScreener metadata for liquidity, age, symbol, etc.
  // This runs in parallel with local stream data processing
  const dexMetadataPromise = fetchDexScreenerMetadata(address);

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

      // Wait for DexScreener metadata
      const dexMetadata = await dexMetadataPromise;

      // Merge local stream data with DexScreener metadata
      return {
        success: true,
        data: {
          address,
          // Price from local stream (more real-time)
          price: stats.price,
          priceNative: stats.priceNative,
          // Price changes from local stream
          priceChange1m: stats.priceChange1m,
          priceChange5m: stats.priceChange5m,
          priceChange1h: stats.priceChange1h || dexMetadata?.dexPriceChange1h || 0,
          priceChange24h: dexMetadata?.dexPriceChange24h || 0,
          // Volume from local stream (in SOL, converted to USD)
          volume1m: stats.volume1m * solPrice,
          volume5m: stats.volume5m * solPrice,
          volume1h: dexMetadata?.dexVolume1h || stats.volume5m * solPrice * 12, // Estimate if not available
          volume24h: dexMetadata?.dexVolume24h || 0,
          // Transaction counts from local stream
          txns1m: {
            buys: tradeStats1m.buys,
            sells: tradeStats1m.sells,
          },
          txns5m: {
            buys: tradeStats5m.buys,
            sells: tradeStats5m.sells,
          },
          txns1h: dexMetadata?.dexTxns1h || {
            buys: tradeStats1h.buys,
            sells: tradeStats1h.sells,
          },
          // Buy pressure calculated from local stream
          buyPressure1m:
            tradeStats1m.buys + tradeStats1m.sells > 0
              ? tradeStats1m.buys / (tradeStats1m.buys + tradeStats1m.sells)
              : 0.5,
          buyPressure5m:
            tradeStats5m.buys + tradeStats5m.sells > 0
              ? tradeStats5m.buys / (tradeStats5m.buys + tradeStats5m.sells)
              : 0.5,
          netFlow1m: tradeStats1m.netFlow,
          netFlow5m: tradeStats5m.netFlow,
          uniqueTraders1m,
          uniqueTraders5m,
          candleCount1m: candles1m.length,
          candleCount5m: candles5m.length,
          recentTradesCount: recentTrades.length,
          // CRITICAL: Liquidity and metadata from DexScreener
          liquidity: dexMetadata?.liquidity || 0,
          fdv: dexMetadata?.fdv || 0,
          mc: dexMetadata?.marketCap || dexMetadata?.fdv || 0,
          pairCreatedAt: dexMetadata?.pairCreatedAt || null,
          ageMinutes: dexMetadata?.ageMinutes || null,
          symbol: dexMetadata?.symbol || '',
          name: dexMetadata?.name || '',
          logoURI: dexMetadata?.logoURI || null,
          holder: dexMetadata?.holder || 0,
          // Source info
          source: 'local-stream',
          dataQuality: dexMetadata ? 'full' : 'partial',
          lastUpdate: stats.lastUpdate,
        },
        meta: {
          solPrice,
          hasLocalData: true,
          hasDexMetadata: !!dexMetadata,
        },
      };
    }
  }

  // No local stream data - use full DexScreener fetch
  const dexData = await fetchFullFromDexScreener(address);

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