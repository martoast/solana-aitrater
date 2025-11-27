/**
 * POST /api/stream/batch
 *
 * Batch fetch token data from local stream.
 * ALWAYS fetches DexScreener for liquidity/metadata, merges with local stream data.
 */

import { defineEventHandler, readBody } from 'h3';
import {
  computeTokenStats,
  hasData,
  getSolPrice,
  getCandles,
} from '../../utils/candle-engine';
import { getTradeStats, getTrades } from '../../utils/trade-store';

// DexScreener batch fetch for metadata (liquidity, age, symbol, etc.)
async function fetchDexScreenerBatch(
  addresses: string[]
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  if (addresses.length === 0) return results;

  try {
    // DexScreener allows up to 30 addresses per request
    const chunks: string[][] = [];
    for (let i = 0; i < addresses.length; i += 30) {
      chunks.push(addresses.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const response = await fetch(
        `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) continue;

      const pairs = await response.json();

      if (!Array.isArray(pairs)) continue;

      const now = Date.now();

      for (const pair of pairs) {
        const address = pair.baseToken?.address;
        if (!address) continue;

        // Keep pair with highest liquidity
        const existingLiq = results[address]?.liquidity || 0;
        const newLiq = pair.liquidity?.usd || 0;

        if (!results[address] || newLiq > existingLiq) {
          const pairAge = pair.pairCreatedAt ? now - pair.pairCreatedAt : 0;

          results[address] = {
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
            mc: pair.marketCap || pair.fdv || 0,
            pairAddress: pair.pairAddress,
            pairCreatedAt: pair.pairCreatedAt,
            ageMinutes: Math.floor(pairAge / 60000),
            source: 'dexscreener',
            dataQuality: 'limited',
            symbol: pair.baseToken?.symbol || '',
            name: pair.baseToken?.name || '',
            logoURI: pair.info?.imageUrl || null,
            holder: pair.holders || 0,
            lastUpdate: now,
          };
        }
      }
    }
  } catch (e) {
    console.error('[BatchAPI] DexScreener fetch error:', e);
  }

  return results;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const addresses: string[] = body.addresses || [];
  const includeTrades = body.includeTrades || false;
  const includeCandles = body.includeCandles || false;

  if (!addresses.length) {
    return {
      success: false,
      error: 'No addresses provided',
      data: {},
    };
  }

  // Limit batch size
  const limitedAddresses = addresses.slice(0, 100);

  const results: Record<string, any> = {};
  const solPrice = getSolPrice();
  const inStream: string[] = [];
  const notInStream: string[] = [];

  // Categorize addresses by whether they're in local stream
  for (const address of limitedAddresses) {
    if (hasData(address)) {
      inStream.push(address);
    } else {
      notInStream.push(address);
    }
  }

  // ALWAYS fetch DexScreener data for ALL tokens (for liquidity/metadata)
  const dexDataPromise = fetchDexScreenerBatch(limitedAddresses);

  // Process local stream data first
  for (const address of inStream) {
    const stats = computeTokenStats(address);

    if (stats) {
      const tradeStats1m = getTradeStats(address, 60000);
      const tradeStats5m = getTradeStats(address, 300000);
      const tradeStats1h = getTradeStats(address, 3600000);

      results[address] = {
        // Price data from local stream (more real-time)
        price: stats.price,
        priceNative: stats.priceNative,
        priceChange1m: stats.priceChange1m,
        priceChange5m: stats.priceChange5m,
        priceChange1h: stats.priceChange1h,
        // Volume from local stream (converted to USD)
        volume1m: stats.volume1m * solPrice,
        volume5m: stats.volume5m * solPrice,
        // Txns from local stream
        txns1m: {
          buys: tradeStats1m.buys,
          sells: tradeStats1m.sells,
        },
        txns5m: {
          buys: tradeStats5m.buys,
          sells: tradeStats5m.sells,
        },
        txns1h: {
          buys: tradeStats1h.buys,
          sells: tradeStats1h.sells,
        },
        source: 'local-stream',
        dataQuality: 'partial', // Will be upgraded to 'full' when merged with dex data
        lastUpdate: stats.lastUpdate,
      };

      // Optionally include recent trades
      if (includeTrades) {
        results[address].recentTrades = getTrades(address, 20);
      }

      // Optionally include candles
      if (includeCandles) {
        results[address].candles = {
          '1m': getCandles(address, '1m').slice(0, 10),
          '5m': getCandles(address, '5m').slice(0, 10),
        };
      }
    }
  }

  // Wait for DexScreener data
  const dexData = await dexDataPromise;

  // Merge DexScreener data
  for (const [address, dex] of Object.entries(dexData)) {
    if (results[address]) {
      // Token is in local stream - merge DexScreener metadata
      results[address] = {
        ...results[address],
        // Keep local stream price/momentum data, but add DexScreener metadata
        priceChange1h: results[address].priceChange1h || dex.priceChange1h,
        priceChange24h: dex.priceChange24h,
        volume1h: dex.volume1h || results[address].volume5m * 12,
        volume24h: dex.volume24h,
        txns1h: results[address].txns1h?.buys > 0 ? results[address].txns1h : dex.txns1h,
        // CRITICAL: Liquidity and metadata from DexScreener
        liquidity: dex.liquidity,
        fdv: dex.fdv,
        mc: dex.mc,
        pairCreatedAt: dex.pairCreatedAt,
        ageMinutes: dex.ageMinutes,
        symbol: dex.symbol || results[address].symbol,
        name: dex.name || results[address].name,
        logoURI: dex.logoURI,
        holder: dex.holder,
        // Mark as full quality since we have both sources
        dataQuality: 'full',
      };
    } else {
      // Token not in local stream - use full DexScreener data
      results[address] = dex;
    }
  }

  // For tokens not found in DexScreener either, they remain with partial data
  // or not in results at all

  return {
    success: true,
    data: results,
    meta: {
      requested: limitedAddresses.length,
      fromStream: inStream.length,
      fromDexScreener: notInStream.filter((a) => results[a]).length,
      merged: inStream.filter((a) => dexData[a]).length,
      notFound: limitedAddresses.filter((a) => !results[a]).length,
      solPrice,
    },
  };
});
