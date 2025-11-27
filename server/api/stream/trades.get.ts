/**
 * GET /api/stream/trades
 * 
 * Get recent trades for a token.
 */

import { defineEventHandler, getQuery, createError } from 'h3';
import { getTrades, getGlobalRecentTrades, getTradeStats } from '../../utils/trade-store';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const address = query.address as string;
  const limit = parseInt(query.limit as string) || 100;
  const global = query.global === 'true';

  // Get global recent trades (across all tokens)
  if (global) {
    return {
      success: true,
      data: getGlobalRecentTrades(limit),
    };
  }

  if (!address) {
    throw createError({
      statusCode: 400,
      message: 'Address is required (or use global=true)',
    });
  }

  const trades = getTrades(address, limit);
  const stats1m = getTradeStats(address, 60_000);
  const stats5m = getTradeStats(address, 300_000);

  return {
    success: true,
    data: {
      address,
      trades,
      stats: {
        '1m': stats1m,
        '5m': stats5m,
      },
    },
  };
});