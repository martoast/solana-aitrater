/**
 * POST /api/stream/batch
 * 
 * Batch fetch token data from local stream.
 * Falls back to DexScreener for tokens not in stream.
 */

import { defineEventHandler, readBody } from 'h3';
import { 
  computeTokenStats,
  hasData,
  getSolPrice,
  getCandles,
} from '../../utils/candle-engine';
import { getTradeStats, getTrades } from '../../utils/trade-store';

// DexScreener fallback for tokens not in stream
async function fetchFromDexScreener(addresses: string[]): Promise<Record<string, any>> {
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
        { headers: { 'Accept': 'application/json' } }
      );
      
      if (!response.ok) continue;
      
      const pairs = await response.json();
      
      if (!Array.isArray(pairs)) continue;
      
      for (const pair of pairs) {
        const address = pair.baseToken?.address;
        if (!address) continue;
        
        // Keep pair with highest liquidity
        const existingLiq = results[address]?.liquidity || 0;
        const newLiq = pair.liquidity?.usd || 0;
        
        if (!results[address] || newLiq > existingLiq) {
          results[address] = {
            price: parseFloat(pair.priceUsd) || 0,
            priceNative: parseFloat(pair.priceNative) || 0,
            priceChange1m: pair.priceChange?.m5 ? pair.priceChange.m5 / 5 : 0, // Estimate 1m from 5m
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
            source: 'dexscreener-bootstrap',
            dataQuality: 'limited',
            symbol: pair.baseToken?.symbol || '',
            name: pair.baseToken?.name || '',
            logoURI: pair.info?.imageUrl || null,
            lastUpdate: Date.now(),
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
      data: {} 
    };
  }
  
  // Limit batch size
  const limitedAddresses = addresses.slice(0, 100);
  
  const results: Record<string, any> = {};
  const solPrice = getSolPrice();
  const notInStream: string[] = [];
  
  // First, check local stream for each token
  for (const address of limitedAddresses) {
    if (hasData(address)) {
      const stats = computeTokenStats(address);
      
      if (stats) {
        const tradeStats = getTradeStats(address, 60000); // 1 minute stats
        const tradeStats5m = getTradeStats(address, 300000); // 5 minute stats
        
        results[address] = {
          ...stats,
          txns1m: {
            buys: tradeStats.buys,
            sells: tradeStats.sells,
          },
          txns5m: {
            buys: tradeStats5m.buys,
            sells: tradeStats5m.sells,
          },
          source: 'local-stream',
          dataQuality: 'full',
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
    } else {
      notInStream.push(address);
    }
  }
  
  // Fetch missing tokens from DexScreener
  if (notInStream.length > 0) {
    const dexData = await fetchFromDexScreener(notInStream);
    
    for (const [address, data] of Object.entries(dexData)) {
      results[address] = data;
    }
  }
  
  return {
    success: true,
    data: results,
    meta: {
      requested: limitedAddresses.length,
      fromStream: limitedAddresses.length - notInStream.length,
      fromDexScreener: Object.keys(results).length - (limitedAddresses.length - notInStream.length),
      notFound: limitedAddresses.filter(a => !results[a]).length,
      solPrice,
    },
  };
});