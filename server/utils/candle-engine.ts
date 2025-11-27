/**
 * Candle Engine - Builds OHLCV candles from trade events
 * 
 * WITH MEMORY LIMITS to prevent crashes!
 */

// === CONFIGURATION ===
const MAX_TOKENS = 500;
const MAX_1S_CANDLES = 120;
const MAX_1M_CANDLES = 60;
const MAX_5M_CANDLES = 48;
const MAX_30M_CANDLES = 48;
const MAX_1H_CANDLES = 48;
const MAX_24H_CANDLES = 14;

const INACTIVE_CLEANUP_MS = 10 * 60 * 1000;

// === SOL PRICE ===
let solPriceUsd = 150;

export function setSolPrice(price: number): void {
  if (price > 0) {
    solPriceUsd = price;
  }
}

export function getSolPrice(): number {
  return solPriceUsd;
}

// === TYPES ===
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  buys: number;
  sells: number;
  timestamp: number;
}

interface TokenCandles {
  '1s': Candle[];
  '1m': Candle[];
  '5m': Candle[];
  '30m': Candle[];
  '1h': Candle[];
  '24h': Candle[];
  current: {
    '1s': Candle | null;
    '1m': Candle | null;
    '5m': Candle | null;
    '30m': Candle | null;
    '1h': Candle | null;
    '24h': Candle | null;
  };
  lastUpdate: number;
  lastPrice: number;
}

type Timeframe = '1s' | '1m' | '5m' | '30m' | '1h' | '24h';

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1s': 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const MAX_CANDLES: Record<Timeframe, number> = {
  '1s': MAX_1S_CANDLES,
  '1m': MAX_1M_CANDLES,
  '5m': MAX_5M_CANDLES,
  '30m': MAX_30M_CANDLES,
  '1h': MAX_1H_CANDLES,
  '24h': MAX_24H_CANDLES,
};

// === STORAGE ===
const tokenCandles = new Map<string, TokenCandles>();
const tokenLastActivity = new Map<string, number>();

// === MAIN FUNCTIONS ===

export function updateCandles(
  mint: string,
  price: number,
  solAmount: number,
  isBuy: boolean,
  timestamp: number
): void {
  const now = Date.now();
  
  if (!tokenCandles.has(mint)) {
    if (tokenCandles.size >= MAX_TOKENS) {
      removeOldestInactiveToken();
    }
    tokenCandles.set(mint, createEmptyTokenCandles());
  }
  
  const candles = tokenCandles.get(mint)!;
  candles.lastUpdate = now;
  candles.lastPrice = price;
  tokenLastActivity.set(mint, now);
  
  const timeframes: Timeframe[] = ['1s', '1m', '5m', '30m', '1h', '24h'];
  
  for (const tf of timeframes) {
    updateTimeframe(candles, tf, price, solAmount, isBuy, timestamp);
  }
}

function updateTimeframe(
  candles: TokenCandles,
  timeframe: Timeframe,
  price: number,
  solAmount: number,
  isBuy: boolean,
  timestamp: number
): void {
  const periodMs = TIMEFRAME_MS[timeframe];
  const periodStart = Math.floor(timestamp / periodMs) * periodMs;
  
  let current = candles.current[timeframe];
  
  if (current && current.timestamp !== periodStart) {
    candles[timeframe].unshift(current);
    
    const maxCandles = MAX_CANDLES[timeframe];
    if (candles[timeframe].length > maxCandles) {
      candles[timeframe] = candles[timeframe].slice(0, maxCandles);
    }
    
    current = null;
  }
  
  if (!current) {
    current = {
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      trades: 0,
      buys: 0,
      sells: 0,
      timestamp: periodStart,
    };
    candles.current[timeframe] = current;
  }
  
  current.high = Math.max(current.high, price);
  current.low = Math.min(current.low, price);
  current.close = price;
  current.volume += solAmount;
  current.trades += 1;
  if (isBuy) {
    current.buys += 1;
  } else {
    current.sells += 1;
  }
}

function createEmptyTokenCandles(): TokenCandles {
  return {
    '1s': [],
    '1m': [],
    '5m': [],
    '30m': [],
    '1h': [],
    '24h': [],
    current: {
      '1s': null,
      '1m': null,
      '5m': null,
      '30m': null,
      '1h': null,
      '24h': null,
    },
    lastUpdate: Date.now(),
    lastPrice: 0,
  };
}

function removeOldestInactiveToken(): void {
  const now = Date.now();
  let oldestToken: string | null = null;
  let oldestTime = now;
  
  for (const [mint, lastActive] of tokenLastActivity.entries()) {
    if (lastActive < oldestTime) {
      oldestTime = lastActive;
      oldestToken = mint;
    }
  }
  
  if (oldestToken) {
    tokenCandles.delete(oldestToken);
    tokenLastActivity.delete(oldestToken);
    console.log(`[CandleEngine] Evicted: ${oldestToken.slice(0, 8)}...`);
  }
}

export function cleanupInactiveTokens(): number {
  const now = Date.now();
  let removed = 0;
  
  for (const [mint, lastActive] of tokenLastActivity.entries()) {
    if (now - lastActive > INACTIVE_CLEANUP_MS) {
      tokenCandles.delete(mint);
      tokenLastActivity.delete(mint);
      removed++;
    }
  }
  
  if (removed > 0) {
    console.log(`[CandleEngine] Cleaned up ${removed} inactive tokens`);
  }
  
  return removed;
}

// === GETTERS ===

export function getCandles(mint: string, timeframe: Timeframe): Candle[] {
  const candles = tokenCandles.get(mint);
  if (!candles) return [];
  
  const result: Candle[] = [];
  const current = candles.current[timeframe];
  if (current) result.push(current);
  result.push(...candles[timeframe]);
  
  return result;
}

export function getCurrentCandle(mint: string, timeframe: Timeframe): Candle | null {
  const candles = tokenCandles.get(mint);
  if (!candles) return null;
  return candles.current[timeframe];
}

export function getLatestPrice(mint: string): number | null {
  const candles = tokenCandles.get(mint);
  if (!candles) return null;
  return candles.lastPrice || null;
}

export function hasData(mint: string): boolean {
  return tokenCandles.has(mint);
}

export function getTrackedTokens(): string[] {
  return Array.from(tokenCandles.keys());
}

export function getEngineStats(): {
  totalTokens: number;
  totalCandles: number;
  memoryUsage: string;
} {
  let totalCandles = 0;
  
  for (const candles of tokenCandles.values()) {
    totalCandles += candles['1s'].length + (candles.current['1s'] ? 1 : 0);
    totalCandles += candles['1m'].length + (candles.current['1m'] ? 1 : 0);
    totalCandles += candles['5m'].length + (candles.current['5m'] ? 1 : 0);
    totalCandles += candles['30m'].length + (candles.current['30m'] ? 1 : 0);
    totalCandles += candles['1h'].length + (candles.current['1h'] ? 1 : 0);
    totalCandles += candles['24h'].length + (candles.current['24h'] ? 1 : 0);
  }
  
  const memoryMB = ((totalCandles * 100) / (1024 * 1024)).toFixed(2);
  
  return {
    totalTokens: tokenCandles.size,
    totalCandles,
    memoryUsage: `~${memoryMB} MB`,
  };
}

export function computeTokenStats(mint: string): any | null {
  const candles = tokenCandles.get(mint);
  if (!candles) return null;
  
  const price = candles.lastPrice;
  if (!price) return null;
  
  const priceUsd = price * solPriceUsd;
  
  const candles1m = getCandles(mint, '1m');
  const candles5m = getCandles(mint, '5m');
  const candles1h = getCandles(mint, '1h');
  
  const priceChange1m = candles1m.length >= 2 
    ? ((price - candles1m[1].open) / candles1m[1].open) * 100 
    : 0;
  
  const priceChange5m = candles5m.length >= 2
    ? ((price - candles5m[1].open) / candles5m[1].open) * 100
    : (candles5m.length === 1 ? ((price - candles5m[0].open) / candles5m[0].open) * 100 : 0);
  
  const priceChange1h = candles1h.length >= 2
    ? ((price - candles1h[1].open) / candles1h[1].open) * 100
    : 0;
  
  const volume1m = candles1m[0]?.volume || 0;
  const volume5m = candles5m.slice(0, 5).reduce((sum, c) => sum + c.volume, 0);
  
  const txns1m = candles1m[0] 
    ? { buys: candles1m[0].buys, sells: candles1m[0].sells }
    : { buys: 0, sells: 0 };
  
  const txns5m = candles5m.slice(0, 5).reduce(
    (acc, c) => ({ buys: acc.buys + c.buys, sells: acc.sells + c.sells }),
    { buys: 0, sells: 0 }
  );
  
  return {
    price: priceUsd,
    priceNative: price,
    priceChange1m,
    priceChange5m,
    priceChange1h,
    volume1m,
    volume5m,
    txns1m,
    txns5m,
    lastUpdate: candles.lastUpdate,
  };
}

// === CLEANUP FUNCTION FOR PLUGIN ===
export function cleanupCandleEngine(): void {
  tokenCandles.clear();
  tokenLastActivity.clear();
  console.log('[CandleEngine] Cleaned up all data');
}