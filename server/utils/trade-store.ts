/**
 * Trade Store
 * 
 * Stores recent trades for each token.
 * Useful for displaying trade history and computing additional metrics.
 */

import type { PumpFunTrade } from './pumpfun-parser';

// === CONSTANTS ===
const MAX_TRADES_PER_TOKEN = 500;
const MAX_TOKENS = 1000;

// === STATE ===
const tradeStore: Map<string, PumpFunTrade[]> = new Map();
const lastAccess: Map<string, number> = new Map();

// Global recent trades (across all tokens)
const globalRecentTrades: PumpFunTrade[] = [];
const MAX_GLOBAL_TRADES = 1000;

// Stats
let totalTradesProcessed = 0;

// === FUNCTIONS ===

/**
 * Add a trade to the store
 */
export function addTrade(trade: PumpFunTrade): void {
  totalTradesProcessed++;

  // Add to token-specific store
  if (!tradeStore.has(trade.mint)) {
    tradeStore.set(trade.mint, []);
  }
  
  const trades = tradeStore.get(trade.mint)!;
  trades.push(trade);
  lastAccess.set(trade.mint, Date.now());

  // Trim if needed
  while (trades.length > MAX_TRADES_PER_TOKEN) {
    trades.shift();
  }

  // Add to global recent trades
  globalRecentTrades.push(trade);
  while (globalRecentTrades.length > MAX_GLOBAL_TRADES) {
    globalRecentTrades.shift();
  }

  // Cleanup if too many tokens
  if (tradeStore.size > MAX_TOKENS) {
    cleanupOldest();
  }
}

/**
 * Get trades for a token
 */
export function getTrades(mint: string, limit: number = 100): PumpFunTrade[] {
  lastAccess.set(mint, Date.now());
  const trades = tradeStore.get(mint) || [];
  return trades.slice(-limit);
}

/**
 * Get recent trades across all tokens
 */
export function getGlobalRecentTrades(limit: number = 100): PumpFunTrade[] {
  return globalRecentTrades.slice(-limit);
}

/**
 * Get trade count for a token
 */
export function getTradeCount(mint: string): number {
  return tradeStore.get(mint)?.length || 0;
}

/**
 * Check if we have any trades for a token
 */
export function hasTrades(mint: string): boolean {
  const trades = tradeStore.get(mint);
  return trades !== undefined && trades.length > 0;
}

/**
 * Get buy/sell stats for a token in a time window
 */
export function getTradeStats(
  mint: string,
  windowMs: number
): { buys: number; sells: number; volume: number; avgSize: number } {
  const trades = tradeStore.get(mint) || [];
  const cutoff = Date.now() - windowMs;
  
  let buys = 0;
  let sells = 0;
  let volume = 0;

  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i];
    if (trade.timestamp < cutoff) break;

    volume += trade.solAmount;
    if (trade.isBuy) buys++;
    else sells++;
  }

  const totalTrades = buys + sells;
  return {
    buys,
    sells,
    volume,
    avgSize: totalTrades > 0 ? volume / totalTrades : 0,
  };
}

/**
 * Get unique traders for a token in a time window
 */
export function getUniqueTraders(mint: string, windowMs: number): number {
  const trades = tradeStore.get(mint) || [];
  const cutoff = Date.now() - windowMs;
  const traders = new Set<string>();

  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i];
    if (trade.timestamp < cutoff) break;
    traders.add(trade.trader);
  }

  return traders.size;
}

/**
 * Remove oldest tokens when limit reached
 */
function cleanupOldest(): void {
  // Sort by last access time and remove oldest 10%
  const entries = Array.from(lastAccess.entries());
  entries.sort((a, b) => a[1] - b[1]);
  
  const toRemove = Math.floor(entries.length * 0.1);
  for (let i = 0; i < toRemove; i++) {
    const mint = entries[i][0];
    tradeStore.delete(mint);
    lastAccess.delete(mint);
  }
}

/**
 * Cleanup tokens not accessed recently
 */
export function cleanup(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let removed = 0;

  for (const [mint, lastTime] of lastAccess.entries()) {
    if (now - lastTime > maxAgeMs) {
      tradeStore.delete(mint);
      lastAccess.delete(mint);
      removed++;
    }
  }

  return removed;
}

/**
 * Get store stats
 */
export function getStoreStats(): {
  totalTokens: number;
  totalTrades: number;
  totalTradesProcessed: number;
  globalRecentCount: number;
} {
  let totalTrades = 0;
  for (const trades of tradeStore.values()) {
    totalTrades += trades.length;
  }

  return {
    totalTokens: tradeStore.size,
    totalTrades,
    totalTradesProcessed,
    globalRecentCount: globalRecentTrades.length,
  };
}