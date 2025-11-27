/**
 * POST /api/stream/batch
 * 
 * Get stats for multiple tokens at once.
 */

import { defineEventHandler, readBody } from 'h3';
import { 
  getComputedStats, 
  hasData,
} from '../../utils/candle-engine';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const addresses: string[] = body.addresses || [];

  if (addresses.length === 0) {
    return { success: true, data: {} };
  }

  // Limit batch size
  const limitedAddresses = addresses.slice(0, 50);
  const results: Record<string, any> = {};
  const missingAddresses: string[] = [];

  // First, get local data for all tokens
  for (const address of limitedAddresses) {
    const hasLocal = hasData(address);
    
    if (hasLocal) {
      const stats = getComputedStats(address);
      if (stats) {
        results[address] = {
          ...stats,
          address,
          timestamp: Date.now(),
          source: 'local-stream',
        };
      } else {
        missingAddresses.push(address);
      }
    } else {
      missingAddresses.push(address);
    }
  }

  // Bootstrap missing from DexScreener
  if (missingAddresses.length > 0) {
    try {
      const chunk = missingAddresses.slice(0, 30).join(',');
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`);
      const json = await res.json();
      const pairs = json.pairs || [];

      for (const pair of pairs) {
        if (pair.chainId !== 'solana') continue;
        
        const addr = pair.baseToken?.address;
        if (!addr || results[addr]) continue;

        const txns = pair.txns || {};
        const priceChange = pair.priceChange || {};
        const volume = pair.volume || {};
        const txns5m = txns.m5 || { buys: 0, sells: 0 };
        const txns1h = txns.h1 || { buys: 0, sells: 0 };

        results[addr] = {
          address: addr,
          timestamp: Date.now(),
          source: 'dexscreener-bootstrap',
          
          price: parseFloat(pair.priceUsd || 0),
          
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
          
          liquidity: pair.liquidity?.usd || 0,
          symbol: pair.baseToken?.symbol || '',
          name: pair.baseToken?.name || '',
          mc: pair.marketCap || 0,
          fdv: pair.fdv || 0,
          createdAt: pair.pairCreatedAt || null,
          ageMinutes: pair.pairCreatedAt 
            ? Math.round((Date.now() - pair.pairCreatedAt) / 60000)
            : null,
        };
      }
    } catch (e) {
      console.error('[Batch] DexScreener bootstrap error:', e);
    }
  }

  return {
    success: true,
    data: results,
    stats: {
      requested: limitedAddresses.length,
      fromLocal: limitedAddresses.length - missingAddresses.length,
      fromBootstrap: Object.keys(results).length - (limitedAddresses.length - missingAddresses.length),
    },
  };
});