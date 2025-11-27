/**
 * Trade Store - Stores recent trades for each token
 */

import type { PumpFunTrade } from './pumpfun-parser';

// === CONFIGURATION ===
const MAX_TRADES_PER_TOKEN = 500;
const MAX_GLOBAL_TRADES = 1000;

// === STORAGE ===
const tradesByToken = new Map<string, PumpFunTrade[]>();
const globalRecentTrades: PumpFunTrade[] = [];
let totalTradesProcessed = 0;

// === MAIN FUNCTIONS ===

export function addTrade(trade: PumpFunTrade): void {
  totalTradesProcessed++;
  
  // Add to token-specific trades
  if (!tradesByToken.has(trade.mint)) {
    tradesByToken.set(trade.mint, []);
  }
  
  const tokenTrades = tradesByToken.get(trade.mint)!;
  tokenTrades.unshift(trade);
  
  // Trim to max
  if (tokenTrades.length > MAX_TRADES_PER_TOKEN) {
    tokenTrades.pop();
  }
  
  // Add to global trades
  globalRecentTrades.unshift(trade);
  if (globalRecentTrades.length > MAX_GLOBAL_TRADES) {
    globalRecentTrades.pop();
  }
}

export function getTrades(mint: string, limit: number = 50): PumpFunTrade[] {
  const trades = tradesByToken.get(mint) || [];
  return trades.slice(0, limit);
}

export function getGlobalRecentTrades(limit: number = 50): PumpFunTrade[] {
  return globalRecentTrades.slice(0, limit);
}

export function getTradeStats(mint: string, windowMs: number = 60000): {
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  netFlow: number;
} {
  const trades = tradesByToken.get(mint) || [];
  const now = Date.now();
  const cutoff = now - windowMs;
  
  let buys = 0, sells = 0, buyVolume = 0, sellVolume = 0;
  
  for (const trade of trades) {
    if (trade.timestamp < cutoff) break;
    
    if (trade.isBuy) {
      buys++;
      buyVolume += trade.solAmount;
    } else {
      sells++;
      sellVolume += trade.solAmount;
    }
  }
  
  return {
    buys,
    sells,
    buyVolume,
    sellVolume,
    netFlow: buyVolume - sellVolume,
  };
}

export function getUniqueTraders(mint: string, windowMs: number = 60000): number {
  const trades = tradesByToken.get(mint) || [];
  const now = Date.now();
  const cutoff = now - windowMs;
  
  const traders = new Set<string>();
  
  for (const trade of trades) {
    if (trade.timestamp < cutoff) break;
    traders.add(trade.trader);
  }
  
  return traders.size;
}

export function getStoreStats(): {
  totalTokens: number;
  totalTrades: number;
  totalTradesProcessed: number;
  globalRecentCount: number;
} {
  let totalTrades = 0;
  for (const trades of tradesByToken.values()) {
    totalTrades += trades.length;
  }
  
  return {
    totalTokens: tradesByToken.size,
    totalTrades,
    totalTradesProcessed,
    globalRecentCount: globalRecentTrades.length,
  };
}

// === CLEANUP FUNCTION FOR PLUGIN ===
export function cleanupTradeStore(): void {
  tradesByToken.clear();
  globalRecentTrades.length = 0;
  totalTradesProcessed = 0;
  console.log('[TradeStore] Cleaned up all data');
}