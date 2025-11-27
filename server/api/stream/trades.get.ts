/**
 * GET /api/stream/trades
 * 
 * Get recent trades from the stream.
 * 
 * Query params:
 * - address: Token address (optional, for token-specific trades)
 * - global: 'true' to get global recent trades
 * - limit: Number of trades to return (default: 50)
 */

import { defineEventHandler, getQuery } from 'h3';
import { getTrades, getGlobalRecentTrades } from '../../utils/trade-store';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const address = query.address as string;
  const isGlobal = query.global === 'true';
  const limit = parseInt(query.limit as string) || 50;
  
  try {
    let trades: any[];
    
    if (isGlobal) {
      trades = getGlobalRecentTrades(limit);
    } else if (address) {
      trades = getTrades(address, limit);
    } else {
      // Default to global trades
      trades = getGlobalRecentTrades(limit);
    }
    
    return {
      success: true,
      data: trades,
      meta: {
        count: trades.length,
        isGlobal,
        address: address || null,
      },
    };
  } catch (e: any) {
    console.error('[TradesAPI] Error:', e);
    return {
      success: false,
      error: e.message,
      data: [],
    };
  }
});