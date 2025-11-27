/**
 * GET /api/stream/candles
 * 
 * Get OHLCV candles for a token.
 */

import { defineEventHandler, getQuery, createError } from 'h3';
import { getCandles, getAllCandles, TIMEFRAMES, type Timeframe } from '../../utils/candle-engine';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const address = query.address as string;
  const timeframe = (query.timeframe as Timeframe) || '1m';

  if (!address) {
    throw createError({
      statusCode: 400,
      message: 'Address is required',
    });
  }

  // Validate timeframe
  if (!TIMEFRAMES.includes(timeframe as any)) {
    throw createError({
      statusCode: 400,
      message: `Invalid timeframe. Use one of: ${TIMEFRAMES.join(', ')}`,
    });
  }

  // Get all timeframes if requested
  if (query.all === 'true') {
    return {
      success: true,
      data: getAllCandles(address),
    };
  }

  // Get specific timeframe
  const snapshot = getCandles(address, timeframe);

  return {
    success: true,
    data: {
      address,
      timeframe,
      current: snapshot.current,
      history: snapshot.history,
      count: snapshot.history.length + (snapshot.current ? 1 : 0),
    },
  };
});