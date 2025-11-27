/**
 * Candle Engine - Builds OHLCV candles from trade events
 * 
 * WITH MEMORY LIMITS to prevent crashes!
 */

// === CONFIGURATION ===
const MAX_TOKENS = 500;           // Max tokens to track
const MAX_1S_CANDLES = 120;       // 2 minutes of 1s candles
const MAX_1M_CANDLES = 60;        // 1 hour of 1m candles
const MAX_5M_CANDLES = 48;        // 4 hours of 5m candles
const MAX_30M_CANDLES = 48;       // 24 hours of 30m candles
const MAX_1H_CANDLES = 48;        // 48 hours of 1h candles
const MAX_24H_CANDLES = 14;       // 2 weeks of 24h candles

const INACTIVE_CLEANUP_MS = 10 * 60 * 1000; // Remove tokens inactive for 10 min

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
const tokenLastActivity = new Map<string, number>(); // Track last activity time

// === MAIN FUNCTIONS ===

export function updateCandles(
  mint: string,
  price: number,
  solAmount: number,
  isBuy: boolean,
  timestamp: number
): void {
  const now = Date.now();
  
  // Initialize token if needed
  if (!tokenCandles.has(mint)) {
    // Check if we're at max capacity
    if (tokenCandles.size >= MAX_TOKENS) {
      // Remove oldest inactive token
      removeOldestInactiveToken();
    }
    
    tokenCandles.set(mint, createEmptyTokenCandles());
  }
  
  const candles = tokenCandles.get(mint)!;
  candles.lastUpdate = now;
  candles.lastPrice = price;
  tokenLastActivity.set(mint, now);
  
  // Update each timeframe
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
  
  // Check if we need to close the current candle and start a new one
  if (current && current.timestamp !== periodStart) {
    // Close current candle
    candles[timeframe].unshift(current);
    
    // Trim to max candles (memory limit!)
    const maxCandles = MAX_CANDLES[timeframe];
    if (candles[timeframe].length > maxCandles) {
      candles[timeframe] = candles[timeframe].slice(0, maxCandles);
    }
    
    current = null;
  }
  
  // Create new candle if needed
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
  
  // Update candle
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
  
  // Find the token with oldest activity
  for (const [mint, lastActive] of tokenLastActivity.entries()) {
    if (lastActive < oldestTime) {
      oldestTime = lastActive;
      oldestToken = mint;
    }
  }
  
  if (oldestToken) {
    tokenCandles.delete(oldestToken);
    tokenLastActivity.delete(oldestToken);
    console.log(`[CandleEngine] Evicted inactive token: ${oldestToken.slice(0, 8)}... (inactive for ${Math.round((now - oldestTime) / 1000)}s)`);
  }
}

// Periodic cleanup of inactive tokens
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
  
  // Add current candle first (if exists)
  const current = candles.current[timeframe];
  if (current) {
    result.push(current);
  }
  
  // Add historical candles
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
  oldestToken: { mint: string; inactiveSeconds: number } | null;
} {
  let totalCandles = 0;
  const now = Date.now();
  let oldestMint = '';
  let oldestTime = now;
  
  for (const [mint, candles] of tokenCandles.entries()) {
    totalCandles += candles['1s'].length + (candles.current['1s'] ? 1 : 0);
    totalCandles += candles['1m'].length + (candles.current['1m'] ? 1 : 0);
    totalCandles += candles['5m'].length + (candles.current['5m'] ? 1 : 0);
    totalCandles += candles['30m'].length + (candles.current['30m'] ? 1 : 0);
    totalCandles += candles['1h'].length + (candles.current['1h'] ? 1 : 0);
    totalCandles += candles['24h'].length + (candles.current['24h'] ? 1 : 0);
    
    const lastActive = tokenLastActivity.get(mint) || now;
    if (lastActive < oldestTime) {
      oldestTime = lastActive;
      oldestMint = mint;
    }
  }
  
  // Estimate memory usage (rough)
  const bytesPerCandle = 100; // Approximate
  const memoryBytes = totalCandles * bytesPerCandle;
  const memoryMB = (memoryBytes / (1024 * 1024)).toFixed(2);
  
  return {
    totalTokens: tokenCandles.size,
    totalCandles,
    memoryUsage: `~${memoryMB} MB`,
    oldestToken: oldestMint ? {
      mint: oldestMint,
      inactiveSeconds: Math.round((now - oldestTime) / 1000),
    } : null,
  };
}

// === STATS COMPUTATION ===

export function computeTokenStats(mint: string, solPrice: number): any | null {
  const candles = tokenCandles.get(mint);
  if (!candles) return null;
  
  const price = candles.lastPrice;
  if (!price) return null;
  
  const priceUsd = price * solPrice;
  
  // Get candles for calculations
  const candles1m = getCandles(mint, '1m');
  const candles5m = getCandles(mint, '5m');
  const candles1h = getCandles(mint, '1h');
  
  // Price changes
  const priceChange1m = candles1m.length >= 2 
    ? ((price - candles1m[1].open) / candles1m[1].open) * 100 
    : 0;
  
  const priceChange5m = candles5m.length >= 2
    ? ((price - candles5m[1].open) / candles5m[1].open) * 100
    : (candles5m.length === 1 ? ((price - candles5m[0].open) / candles5m[0].open) * 100 : 0);
  
  const priceChange1h = candles1h.length >= 2
    ? ((price - candles1h[1].open) / candles1h[1].open) * 100
    : 0;
  
  // Volume and transactions
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

// Start periodic cleanup
setInterval(() => {
  cleanupInactiveTokens();
}, 60_000); // Every minute