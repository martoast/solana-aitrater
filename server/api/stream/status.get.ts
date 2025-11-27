/**
 * GET /api/stream/status
 * 
 * Get current stream status and statistics.
 */

import { defineEventHandler } from 'h3';
import { getStreamStats, isStreamConnected } from '../../utils/helius-stream';
import { getEngineStats, getSolPrice, getTrackedTokens } from '../../utils/candle-engine';
import { getStoreStats } from '../../utils/trade-store';

export default defineEventHandler(() => {
  try {
    const streamStats = getStreamStats();
    const engineStats = getEngineStats();
    const tradeStats = getStoreStats();
    const solPrice = getSolPrice();
    const trackedTokens = getTrackedTokens();
    
    return {
      success: true,
      data: {
        stream: {
          connected: streamStats.connected,
          tradesProcessed: streamStats.tradesProcessed,
          messagesReceived: streamStats.messagesReceived,
          parsedFromLogs: streamStats.parsedFromLogs,
          parseFailures: streamStats.parseFailures,
          errors: streamStats.errors,
          reconnects: streamStats.reconnects,
          uptime: streamStats.uptime,
          lastMessageAgo: streamStats.lastMessage ? Date.now() - streamStats.lastMessage : 0,
        },
        candles: {
          totalTokens: engineStats.totalTokens,
          totalCandles: engineStats.totalCandles,
          memoryUsage: engineStats.memoryUsage,
        },
        trades: {
          totalTokens: tradeStats.totalTokens,
          totalTrades: tradeStats.totalTrades,
          totalTradesProcessed: tradeStats.totalTradesProcessed,
          globalRecentCount: tradeStats.globalRecentCount,
        },
        prices: {
          solUsd: solPrice,
        },
        trackedTokens: trackedTokens.slice(0, 100), // Return first 100
      },
    };
  } catch (e: any) {
    console.error('[StatusAPI] Error:', e);
    return {
      success: false,
      error: e.message,
      data: null,
    };
  }
});