/**
 * Token Data Queue System
 * 
 * Now uses local stream data with DexScreener fallback.
 * No more BirdEye dependency!
 */

import { ref, computed } from 'vue';
import type { TokenData } from '~/types/trading';

// === TYPES ===
interface StreamTokenData {
  address: string;
  timestamp?: number;
  lastUpdate?: number;
  source: string;
  dataQuality?: string;
  price: number;
  priceNative?: number;

  priceChange1m: number;
  priceChange5m: number;
  priceChange30m?: number;
  priceChange1h: number;
  priceChange24h?: number;

  volume1m: number;
  volume5m: number;
  volume30m?: number;
  volume1h: number;
  volume24h?: number;

  // New format (from updated API)
  txns1m?: { buys: number; sells: number };
  txns5m?: { buys: number; sells: number };
  txns1h?: { buys: number; sells: number };

  // Old format (for backwards compatibility)
  buys1m?: number;
  sells1m?: number;
  buys5m?: number;
  sells5m?: number;
  buys1h?: number;
  sells1h?: number;

  trades1m?: number;
  trades5m?: number;
  trades1h?: number;

  liquidity: number;
  symbol: string;
  name: string;
  mc?: number;
  fdv?: number;
  holder?: number;
  createdAt?: number | null;
  pairCreatedAt?: number | null;
  ageMinutes?: number | null;
  logoURI?: string | null;
}

// === STATE ===
const cache = ref<Map<string, { data: StreamTokenData; timestamp: number }>>(new Map());
const totalRequests = ref(0);
const failedRequests = ref(0);
const localHits = ref(0);
const bootstrapHits = ref(0);

// === CONSTANTS ===
const CACHE_TTL_MS = 2000; // 2 second cache
const REQUEST_TIMEOUT_MS = 8000;

export function useTokenQueue() {
  // === CACHE HELPERS ===
  const getCachedData = (address: string): StreamTokenData | null => {
    const cached = cache.value.get(address);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    return null;
  };

  const setCachedData = (address: string, data: StreamTokenData) => {
    cache.value.set(address, { data, timestamp: Date.now() });
    
    // Limit cache size
    if (cache.value.size > 500) {
      const entries = Array.from(cache.value.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 100; i++) {
        cache.value.delete(entries[i][0]);
      }
    }
  };

  // === FETCH SINGLE TOKEN ===
  const fetchTokenData = async (address: string): Promise<StreamTokenData | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      // Use our local stream endpoint
      const response = await fetch(`/api/stream/stats?address=${address}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const json = await response.json();

      if (json.success && json.data) {
        totalRequests.value++;
        
        if (json.source === 'local-stream') {
          localHits.value++;
        } else {
          bootstrapHits.value++;
        }
        
        return json.data as StreamTokenData;
      }

      failedRequests.value++;
      return null;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn(`Request timed out for ${address}`);
      }
      failedRequests.value++;
      return null;
    }
  };

  // === QUEUE MANAGEMENT (simplified - no rate limiting needed!) ===
  const addToQueue = async (
    address: string,
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'
  ): Promise<StreamTokenData | null> => {
    // CRITICAL: Bypass cache for active trades to get real-time prices
    const bypassCache = priority === 'critical';

    // Check cache first (unless critical priority)
    if (!bypassCache) {
      const cached = getCachedData(address);
      if (cached) {
        return cached;
      }
    }

    const data = await fetchTokenData(address);
    if (data) {
      setCachedData(address, data);
    }
    return data;
  };

  // === BATCH FETCH ===
  const addBatchToQueue = async (
    addresses: string[],
    priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'
  ): Promise<Map<string, StreamTokenData | null>> => {
    const results = new Map<string, StreamTokenData | null>();

    // CRITICAL: Bypass cache for active trades to get real-time prices
    const bypassCache = priority === 'critical';

    // Check cache first (unless critical priority)
    const uncached: string[] = [];
    if (!bypassCache) {
      for (const addr of addresses) {
        const cached = getCachedData(addr);
        if (cached) {
          results.set(addr, cached);
        } else {
          uncached.push(addr);
        }
      }
    } else {
      // Critical priority - fetch all addresses fresh
      uncached.push(...addresses);
    }

    if (uncached.length === 0) {
      return results;
    }

    // Batch fetch from our endpoint
    try {
      const response = await fetch('/api/stream/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: uncached }),
      });
      
      const json = await response.json();
      
      if (json.success && json.data) {
        for (const [addr, data] of Object.entries(json.data)) {
          const tokenData = data as StreamTokenData;
          results.set(addr, tokenData);
          setCachedData(addr, tokenData);
          totalRequests.value++;
        }
      }
    } catch (e) {
      console.error('Batch fetch error:', e);
      failedRequests.value++;
    }
    
    // Set null for any still missing
    for (const addr of uncached) {
      if (!results.has(addr)) {
        results.set(addr, null);
      }
    }
    
    return results;
  };

  // === IMMEDIATE FETCH ===
  const fetchImmediate = async (address: string): Promise<StreamTokenData | null> => {
    const cached = getCachedData(address);
    if (cached) return cached;
    
    const data = await fetchTokenData(address);
    if (data) {
      setCachedData(address, data);
    }
    return data;
  };

  // === CONVERT TO TOKENDATA FORMAT ===
  const toTokenData = (stream: StreamTokenData, existingData?: Partial<TokenData>): TokenData => {
    // Handle both old format (buys1m/sells1m) and new format (txns1m.buys/sells)
    const txns1m = stream.txns1m || { buys: stream.buys1m || 0, sells: stream.sells1m || 0 };
    const txns5m = stream.txns5m || { buys: stream.buys5m || 0, sells: stream.sells5m || 0 };
    const txns1h = stream.txns1h || { buys: stream.buys1h || 0, sells: stream.sells1h || 0 };

    const ageMinutes = stream.ageMinutes ||
      (stream.createdAt ? Math.round((Date.now() - stream.createdAt) / 60000) : undefined) ||
      (stream.pairCreatedAt ? Math.round((Date.now() - stream.pairCreatedAt) / 60000) : undefined);

    return {
      address: stream.address,
      symbol: stream.symbol || existingData?.symbol || 'UNK',
      name: stream.name || existingData?.name || '',
      logoURI: stream.logoURI || existingData?.logoURI || '',
      price: stream.price,
      liquidity: stream.liquidity || 0,
      fdv: stream.fdv,
      mc: stream.mc,
      ageMinutes,
      ageHours: ageMinutes ? Math.round(ageMinutes / 60 * 10) / 10 : undefined,

      // Price changes
      priceChange1m: stream.priceChange1m,
      priceChange5m: stream.priceChange5m,
      priceChange15m: stream.priceChange30m ? stream.priceChange30m / 2 : undefined,
      priceChange30m: stream.priceChange30m,
      priceChange1h: stream.priceChange1h,
      priceChange24h: stream.priceChange24h,

      // Volume
      volume1m: stream.volume1m,
      volume5m: stream.volume5m,
      volume15m: stream.volume30m ? stream.volume30m / 2 : undefined,
      volume30m: stream.volume30m,
      volume1h: stream.volume1h,
      volume24h: stream.volume24h,

      // Transactions - handle both formats
      txns1m: {
        buys: txns1m.buys || 0,
        sells: txns1m.sells || 0,
      },
      txns5m: {
        buys: txns5m.buys || 0,
        sells: txns5m.sells || 0,
      },
      txns15m: {
        buys: Math.round((txns1h.buys || 0) / 4),
        sells: Math.round((txns1h.sells || 0) / 4),
      },
      txns30m: {
        buys: Math.round((txns1h.buys || 0) / 2),
        sells: Math.round((txns1h.sells || 0) / 2),
      },
      txns1h: {
        buys: txns1h.buys || 0,
        sells: txns1h.sells || 0,
      },

      // Derived
      txnVelocity1m: stream.trades1m || (txns1m.buys + txns1m.sells),
      priceVelocity1m: stream.priceChange1m,

      // Meta
      pairCreatedAt: stream.pairCreatedAt || stream.createdAt || undefined,
      lastUpdated: stream.timestamp || stream.lastUpdate,
      dataQuality: stream.dataQuality === 'full' ? 'full' : (stream.source === 'local-stream' ? 'full' : 'partial'),
      holder: stream.holder,
    };
  };

  // === NO-OP FUNCTIONS (for compatibility) ===
  const startProcessor = () => {
    console.log('[TokenQueue] Using local stream - no processor needed');
  };

  const stopProcessor = () => {
    console.log('[TokenQueue] Stopped');
  };

  const clearQueue = () => {
    cache.value.clear();
  };

  // === STATS ===
  const queueStats = computed(() => ({
    queueLength: 0, // No queue needed!
    cacheSize: cache.value.size,
    totalRequests: totalRequests.value,
    failedRequests: failedRequests.value,
    localHits: localHits.value,
    bootstrapHits: bootstrapHits.value,
    isProcessing: false,
    requestsThisSecond: 0,
  }));

  return {
    addToQueue,
    addBatchToQueue,
    fetchImmediate,
    clearQueue,
    startProcessor,
    stopProcessor,
    toTokenData,
    getCachedData,
    queueStats,
    isApiAvailable: ref(true),
  };
}

// Alias for backward compatibility
export const useBirdEyeQueue = useTokenQueue;