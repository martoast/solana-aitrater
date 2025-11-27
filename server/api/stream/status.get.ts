/**
 * GET /api/stream/status
 * 
 * Get stream health and statistics.
 */

import { defineEventHandler } from 'h3';
import { getStreamStats, isStreamConnected, isStreamRunning } from '../../utils/helius-stream';
import { getEngineStats, getTrackedTokens, getSolPrice } from '../../utils/candle-engine';
import { getStoreStats } from '../../utils/trade-store';

export default defineEventHandler(() => {
  const streamStats = getStreamStats();
  const engineStats = getEngineStats();
  const storeStats = getStoreStats();

  return {
    success: true,
    data: {
      stream: {
        running: isStreamRunning(),
        connected: isStreamConnected(),
        uptime: streamStats.uptime,
        uptimeFormatted: formatUptime(streamStats.uptime),
        messagesReceived: streamStats.messagesReceived,
        tradesProcessed: streamStats.tradesProcessed,
        parsedFromLogs: streamStats.parsedFromLogs,    // ADD THIS
        parseFailures: streamStats.parseFailures,       // ADD THIS
        errors: streamStats.errors,
        reconnects: streamStats.reconnects,
        lastMessage: streamStats.lastMessage,
        lastMessageAgo: Date.now() - streamStats.lastMessage,
      },
      candles: {
        totalTokens: engineStats.totalTokens,
        totalCandles: engineStats.totalCandles,
        memoryUsage: engineStats.memoryUsage,
      },
      trades: {
        totalTokens: storeStats.totalTokens,
        totalTrades: storeStats.totalTrades,
        totalProcessed: storeStats.totalTradesProcessed,
        globalRecentCount: storeStats.globalRecentCount,
      },
      prices: {
        solUsd: getSolPrice(),
      },
      trackedTokens: getTrackedTokens().slice(0, 100), // Show more tokens
    },
  };
});

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}