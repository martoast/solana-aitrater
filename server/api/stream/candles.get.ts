/**
 * GET /api/stream/candles
 * 
 * Get OHLCV candle data for a token.
 * 
 * Query params:
 * - address: Token mint address (required)
 * - timeframe: '1s' | '1m' | '5m' | '30m' | '1h' | '24h' (default: '1m')
 * - limit: Number of candles to return (default: 50)
 */

import { defineEventHandler, getQuery, createError } from 'h3';
import { getCandles, hasData, getSolPrice } from '../../utils/candle-engine';

// Valid timeframes
const VALID_TIMEFRAMES = ['1s', '1m', '5m', '30m', '1h', '24h'] as const;
type Timeframe = typeof VALID_TIMEFRAMES[number];

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const address = query.address as string;
  const timeframe = (query.timeframe as string) || '1m';
  const limit = parseInt(query.limit as string) || 50;
  
  // Validate address
  if (!address) {
    throw createError({
      statusCode: 400,
      message: 'Missing required parameter: address',
    });
  }
  
  // Validate timeframe
  if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
    throw createError({
      statusCode: 400,
      message: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}`,
    });
  }
  
  // Check if we have data for this token
  if (!hasData(address)) {
    return {
      success: true,
      data: {
        address,
        timeframe,
        candles: [],
        source: 'no-data',
      },
      meta: {
        message: 'Token not found in stream. It may not have traded recently on PumpFun.',
      },
    };
  }
  
  // Get candles
  const candles = getCandles(address, timeframe as Timeframe);
  const limitedCandles = candles.slice(0, Math.min(limit, 500));
  
  // Convert to standard OHLCV format
  const solPrice = getSolPrice();
  const formattedCandles = limitedCandles.map(candle => ({
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    volumeUsd: candle.volume * solPrice,
    trades: candle.trades,
    buys: candle.buys,
    sells: candle.sells,
  }));
  
  return {
    success: true,
    data: {
      address,
      timeframe,
      candles: formattedCandles,
      source: 'local-stream',
    },
    meta: {
      count: formattedCandles.length,
      solPrice,
      oldestTimestamp: formattedCandles.length > 0 
        ? formattedCandles[formattedCandles.length - 1].timestamp 
        : null,
      newestTimestamp: formattedCandles.length > 0 
        ? formattedCandles[0].timestamp 
        : null,
    },
  };
});