<template>
    <div class="min-h-screen bg-gray-900 text-white p-6">
      <!-- Header -->
      <div class="max-w-7xl mx-auto">
        <h1 class="text-3xl font-bold mb-2">🔬 Stream Test Dashboard</h1>
        <p class="text-gray-400 mb-6">
          Testing real-time PumpFun data pipeline
        </p>
  
        <!-- Token Input -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6">
          <label class="block text-sm text-gray-400 mb-2">Token Address</label>
          <div class="flex gap-4">
            <input
              v-model="tokenAddress"
              type="text"
              class="flex-1 bg-gray-700 rounded px-4 py-2 font-mono text-sm"
              placeholder="Enter token mint address..."
            />
            <button
              @click="startTracking"
              :disabled="isLoading"
              class="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium disabled:opacity-50"
            >
              {{ isLoading ? 'Loading...' : 'Track Token' }}
            </button>
            <button
              @click="toggleAutoRefresh"
              :class="[
                'px-6 py-2 rounded font-medium',
                autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
              ]"
            >
              {{ autoRefresh ? '⏸ Stop' : '▶ Auto Refresh' }}
            </button>
          </div>
          <div class="mt-2 text-xs text-gray-500">
            Default: WOJAK (8J69rbLTzWWgUJziFY8jeu5tDwEPBwUz4pKBMr5rpump)
          </div>
        </div>
  
        <!-- Stream Status -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <!-- Stream Health -->
          <div class="bg-gray-800 rounded-lg p-4">
            <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
              <span :class="streamStatus?.stream?.connected ? 'text-green-500' : 'text-red-500'">●</span>
              Stream Status
            </h2>
            <div v-if="streamStatus" class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-400">Connected:</span>
                <span :class="streamStatus.stream.connected ? 'text-green-400' : 'text-red-400'">
                  {{ streamStatus.stream.connected ? 'Yes' : 'No' }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Parse Failures:</span>
                <span :class="streamStatus.stream.parseFailures > 0 ? 'text-yellow-400' : 'text-gray-400'">
                    {{ streamStatus.stream.parseFailures || 0 }}
                </span>
                </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Uptime:</span>
                <span>{{ streamStatus.stream.uptimeFormatted }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Messages:</span>
                <span>{{ streamStatus.stream.messagesReceived.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Trades Processed:</span>
                <span class="text-green-400">{{ streamStatus.stream.tradesProcessed.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Parsed from Logs:</span>
                <span class="text-blue-400">{{ streamStatus.stream.parsedFromLogs?.toLocaleString() || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Errors:</span>
                <span :class="streamStatus.stream.errors > 0 ? 'text-red-400' : 'text-gray-400'">
                  {{ streamStatus.stream.errors }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Tokens Tracked:</span>
                <span>{{ streamStatus.candles.totalTokens }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Total Candles:</span>
                <span>{{ streamStatus.candles.totalCandles.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">SOL Price:</span>
                <span class="text-yellow-400">${{ streamStatus.prices.solUsd.toFixed(2) }}</span>
              </div>
            </div>
            <div v-else class="text-gray-500 text-sm">Loading stream status...</div>
          </div>
  
          <!-- Token Stats -->
          <div class="bg-gray-800 rounded-lg p-4 lg:col-span-2">
            <h2 class="text-lg font-semibold mb-4">
              📊 Token Stats
              <span v-if="tokenStats?.symbol" class="text-purple-400 ml-2">
                ${{ tokenStats.symbol }}
              </span>
              <span v-if="tokenStats?.source" class="text-xs ml-2 px-2 py-1 rounded" 
                    :class="tokenStats.source === 'local-stream' ? 'bg-green-600' : 'bg-yellow-600'">
                {{ tokenStats.source }}
              </span>
            </h2>
            
            <div v-if="tokenStats" class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <!-- Price -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Price</div>
                <div class="text-lg font-mono">
                  ${{ formatPrice(tokenStats.price) }}
                </div>
              </div>
  
              <!-- 1m Change -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">1m Change</div>
                <div class="text-lg font-mono" :class="getChangeClass(tokenStats.priceChange1m)">
                  {{ formatChange(tokenStats.priceChange1m) }}%
                </div>
              </div>
  
              <!-- 5m Change -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">5m Change</div>
                <div class="text-lg font-mono" :class="getChangeClass(tokenStats.priceChange5m)">
                  {{ formatChange(tokenStats.priceChange5m) }}%
                </div>
              </div>
  
              <!-- 1h Change -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">1h Change</div>
                <div class="text-lg font-mono" :class="getChangeClass(tokenStats.priceChange1h)">
                  {{ formatChange(tokenStats.priceChange1h) }}%
                </div>
              </div>
  
              <!-- Volume 1m -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Volume 1m</div>
                <div class="text-lg font-mono">
                  {{ formatVolume(tokenStats.volume1m) }} SOL
                </div>
              </div>
  
              <!-- Volume 5m -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Volume 5m</div>
                <div class="text-lg font-mono">
                  {{ formatVolume(tokenStats.volume5m) }} SOL
                </div>
              </div>
  
              <!-- Buys/Sells 1m -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Txns 1m</div>
                <div class="text-lg font-mono">
                  <span class="text-green-400">{{ tokenStats.buys1m }}</span>
                  <span class="text-gray-500">/</span>
                  <span class="text-red-400">{{ tokenStats.sells1m }}</span>
                </div>
              </div>
  
              <!-- Buys/Sells 5m -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Txns 5m</div>
                <div class="text-lg font-mono">
                  <span class="text-green-400">{{ tokenStats.buys5m }}</span>
                  <span class="text-gray-500">/</span>
                  <span class="text-red-400">{{ tokenStats.sells5m }}</span>
                </div>
              </div>
  
              <!-- Liquidity -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Liquidity</div>
                <div class="text-lg font-mono">
                  ${{ formatLiquidity(tokenStats.liquidity) }}
                </div>
              </div>
  
              <!-- Market Cap -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Market Cap</div>
                <div class="text-lg font-mono">
                  ${{ formatLiquidity(tokenStats.mc) }}
                </div>
              </div>
  
              <!-- Age -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Age</div>
                <div class="text-lg font-mono">
                  {{ formatAge(tokenStats.ageMinutes) }}
                </div>
              </div>
  
              <!-- Last Update -->
              <div class="bg-gray-700/50 rounded p-3">
                <div class="text-gray-400 text-xs mb-1">Last Update</div>
                <div class="text-lg font-mono text-gray-300">
                  {{ formatTimestamp(tokenStats.timestamp) }}
                </div>
              </div>
            </div>
  
            <div v-else-if="isLoading" class="text-gray-500 text-center py-8">
              Loading token data...
            </div>
            <div v-else class="text-gray-500 text-center py-8">
              Enter a token address and click "Track Token"
            </div>
          </div>
        </div>
  
        <!-- Candles Section -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 class="text-lg font-semibold mb-4">📈 Candle Data (All Timeframes)</h2>
          
          <div v-if="candleData" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div v-for="tf in timeframes" :key="tf" class="bg-gray-700/50 rounded p-3">
              <div class="text-purple-400 font-semibold mb-2">{{ tf }}</div>
              <div v-if="candleData[tf]?.current" class="text-xs space-y-1">
                <div class="flex justify-between">
                  <span class="text-gray-400">O:</span>
                  <span class="font-mono">{{ formatPrice(candleData[tf].current.open) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">H:</span>
                  <span class="font-mono text-green-400">{{ formatPrice(candleData[tf].current.high) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">L:</span>
                  <span class="font-mono text-red-400">{{ formatPrice(candleData[tf].current.low) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">C:</span>
                  <span class="font-mono">{{ formatPrice(candleData[tf].current.close) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Vol:</span>
                  <span class="font-mono">{{ candleData[tf].current.volume?.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Txns:</span>
                  <span class="font-mono">{{ candleData[tf].current.trades }}</span>
                </div>
                <div class="text-gray-500 text-center mt-2">
                  {{ candleData[tf].history?.length || 0 }} history
                </div>
              </div>
              <div v-else class="text-gray-500 text-xs text-center py-4">
                No data
              </div>
            </div>
          </div>
          
          <div v-else class="text-gray-500 text-center py-8">
            No candle data available yet
          </div>
        </div>
  
        <!-- Recent Trades -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 class="text-lg font-semibold mb-4">
            💱 Recent Trades
            <span v-if="trades?.length" class="text-gray-400 text-sm ml-2">
              ({{ trades.length }} trades)
            </span>
          </h2>
          
          <div v-if="trades?.length" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-gray-400 text-left">
                  <th class="pb-2">Type</th>
                  <th class="pb-2">Price</th>
                  <th class="pb-2">SOL</th>
                  <th class="pb-2">Tokens</th>
                  <th class="pb-2">Trader</th>
                  <th class="pb-2">Time</th>
                  <th class="pb-2">Signature</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trade in trades.slice(0, 20)" :key="trade.signature" 
                    class="border-t border-gray-700">
                  <td class="py-2">
                    <span :class="trade.isBuy ? 'text-green-400' : 'text-red-400'">
                      {{ trade.isBuy ? '🟢 BUY' : '🔴 SELL' }}
                    </span>
                  </td>
                  <td class="py-2 font-mono">${{ formatPrice(trade.price) }}</td>
                  <td class="py-2 font-mono">{{ trade.solAmount?.toFixed(4) }}</td>
                  <td class="py-2 font-mono">{{ formatTokenAmount(trade.tokenAmount) }}</td>
                  <td class="py-2 font-mono text-xs">
                    <a :href="`https://solscan.io/account/${trade.trader}`" 
                       target="_blank" class="text-blue-400 hover:underline">
                      {{ trade.trader?.slice(0, 4) }}...{{ trade.trader?.slice(-4) }}
                    </a>
                  </td>
                  <td class="py-2 text-gray-400">{{ formatTradeTime(trade.timestamp) }}</td>
                  <td class="py-2 font-mono text-xs">
                    <a :href="`https://solscan.io/tx/${trade.signature}`" 
                       target="_blank" class="text-blue-400 hover:underline">
                      {{ trade.signature?.slice(0, 8) }}...
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div v-else class="text-gray-500 text-center py-8">
            No trades recorded yet for this token
          </div>
        </div>
  
        <!-- Global Recent Trades -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 class="text-lg font-semibold mb-4">
            🌐 Global Recent Trades (All Tokens)
            <span v-if="globalTrades?.length" class="text-gray-400 text-sm ml-2">
              ({{ globalTrades.length }} trades)
            </span>
          </h2>
          
          <div v-if="globalTrades?.length" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-gray-400 text-left">
                  <th class="pb-2">Type</th>
                  <th class="pb-2">Token</th>
                  <th class="pb-2">Price</th>
                  <th class="pb-2">SOL</th>
                  <th class="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trade in globalTrades.slice(0, 15)" :key="trade.signature" 
                    class="border-t border-gray-700 hover:bg-gray-700/50 cursor-pointer"
                    @click="tokenAddress = trade.mint; startTracking()">
                  <td class="py-2">
                    <span :class="trade.isBuy ? 'text-green-400' : 'text-red-400'">
                      {{ trade.isBuy ? '🟢' : '🔴' }}
                    </span>
                  </td>
                  <td class="py-2 font-mono text-xs text-purple-400">
                    {{ trade.mint?.slice(0, 6) }}...{{ trade.mint?.slice(-4) }}
                  </td>
                  <td class="py-2 font-mono">${{ formatPrice(trade.price) }}</td>
                  <td class="py-2 font-mono">{{ trade.solAmount?.toFixed(3) }}</td>
                  <td class="py-2 text-gray-400">{{ formatTradeTime(trade.timestamp) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="text-xs text-gray-500 mt-2">Click a row to track that token</p>
          </div>
          
          <div v-else class="text-gray-500 text-center py-8">
            No global trades yet - stream is warming up
          </div>
        </div>
  
        <!-- Tracked Tokens -->
        <div class="bg-gray-800 rounded-lg p-4">
          <h2 class="text-lg font-semibold mb-4">
            📋 All Tracked Tokens
            <span v-if="streamStatus?.trackedTokens?.length" class="text-gray-400 text-sm ml-2">
              ({{ streamStatus.trackedTokens.length }} tokens)
            </span>
          </h2>
          
          <div v-if="streamStatus?.trackedTokens?.length" class="flex flex-wrap gap-2">
            <button
              v-for="token in streamStatus.trackedTokens.slice(0, 50)" 
              :key="token"
              @click="tokenAddress = token; startTracking()"
              class="px-3 py-1 bg-gray-700 hover:bg-purple-600 rounded text-xs font-mono transition-colors"
              :class="token === tokenAddress ? 'bg-purple-600' : ''"
            >
              {{ token.slice(0, 6) }}...{{ token.slice(-4) }}
            </button>
          </div>
          
          <div v-else class="text-gray-500 text-center py-8">
            No tokens tracked yet - stream is warming up
          </div>
        </div>
  
        <!-- Raw Data (Collapsed) -->
        <details class="bg-gray-800 rounded-lg p-4 mt-6">
          <summary class="cursor-pointer text-lg font-semibold">🔍 Raw JSON Data</summary>
          <div class="mt-4 space-y-4">
            <div>
              <h3 class="text-sm text-gray-400 mb-2">Token Stats</h3>
              <pre class="bg-gray-900 p-3 rounded text-xs overflow-auto max-h-64">{{ JSON.stringify(tokenStats, null, 2) }}</pre>
            </div>
            <div>
              <h3 class="text-sm text-gray-400 mb-2">Stream Status</h3>
              <pre class="bg-gray-900 p-3 rounded text-xs overflow-auto max-h-64">{{ JSON.stringify(streamStatus, null, 2) }}</pre>
            </div>
            <div>
              <h3 class="text-sm text-gray-400 mb-2">Candle Data</h3>
              <pre class="bg-gray-900 p-3 rounded text-xs overflow-auto max-h-64">{{ JSON.stringify(candleData, null, 2) }}</pre>
            </div>
          </div>
        </details>
  
        <!-- Refresh indicator -->
        <div v-if="autoRefresh" class="fixed bottom-4 right-4 bg-green-600 px-4 py-2 rounded-full text-sm flex items-center gap-2">
          <span class="animate-pulse">●</span>
          Auto-refreshing every {{ refreshInterval / 1000 }}s
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted, onUnmounted } from 'vue';
  
  // Default token (WOJAK)
  const DEFAULT_TOKEN = 'DDQD5hUDKgHxEeU7iECqbMLBk1Ty4SuoW97u77e6pump';
  
  // State
  const tokenAddress = ref(DEFAULT_TOKEN);
  const tokenStats = ref<any>(null);
  const candleData = ref<any>(null);
  const trades = ref<any[]>([]);
  const globalTrades = ref<any[]>([]);
  const streamStatus = ref<any>(null);
  const isLoading = ref(false);
  const autoRefresh = ref(false);
  const refreshInterval = 2000; // 2 seconds
  
  const timeframes = ['1s', '1m', '5m', '30m', '1h', '24h'];
  
  let refreshTimer: NodeJS.Timeout | null = null;
  
  // Fetch functions
  const fetchStreamStatus = async () => {
    try {
      const res = await fetch('/api/stream/status');
      const json = await res.json();
      if (json.success) {
        streamStatus.value = json.data;
      }
    } catch (e) {
      console.error('Failed to fetch stream status:', e);
    }
  };
  
  const fetchTokenStats = async () => {
    if (!tokenAddress.value) return;
    
    try {
      const res = await fetch(`/api/stream/stats?address=${tokenAddress.value}`);
      const json = await res.json();
      if (json.success) {
        tokenStats.value = json.data;
      } else {
        tokenStats.value = { error: json.error };
      }
    } catch (e) {
      console.error('Failed to fetch token stats:', e);
    }
  };
  
  const fetchCandles = async () => {
    if (!tokenAddress.value) return;
    
    try {
      const res = await fetch(`/api/stream/candles?address=${tokenAddress.value}&all=true`);
      const json = await res.json();
      if (json.success) {
        candleData.value = json.data;
      }
    } catch (e) {
      console.error('Failed to fetch candles:', e);
    }
  };
  
  const fetchTrades = async () => {
    if (!tokenAddress.value) return;
    
    try {
      const res = await fetch(`/api/stream/trades?address=${tokenAddress.value}&limit=50`);
      const json = await res.json();
      if (json.success) {
        trades.value = json.data?.trades || [];
      }
    } catch (e) {
      console.error('Failed to fetch trades:', e);
    }
  };
  
  const fetchGlobalTrades = async () => {
    try {
      const res = await fetch('/api/stream/trades?global=true&limit=50');
      const json = await res.json();
      if (json.success) {
        globalTrades.value = json.data || [];
      }
    } catch (e) {
      console.error('Failed to fetch global trades:', e);
    }
  };
  
  const startTracking = async () => {
    isLoading.value = true;
    await Promise.all([
      fetchTokenStats(),
      fetchCandles(),
      fetchTrades(),
      fetchStreamStatus(),
      fetchGlobalTrades(),
    ]);
    isLoading.value = false;
  };
  
  const refreshAll = async () => {
    await Promise.all([
      fetchTokenStats(),
      fetchCandles(),
      fetchTrades(),
      fetchStreamStatus(),
      fetchGlobalTrades(),
    ]);
  };
  
  const toggleAutoRefresh = () => {
    autoRefresh.value = !autoRefresh.value;
    
    if (autoRefresh.value) {
      refreshTimer = setInterval(refreshAll, refreshInterval);
    } else if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
  
  // Formatters
  const formatPrice = (price: number) => {
    if (!price || isNaN(price)) return '0.00000000';
    if (price < 0.00000001) return price.toExponential(2);
    if (price < 0.0001) return price.toFixed(10);
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };
  
  const formatChange = (change: number) => {
    if (!change || isNaN(change)) return '0.00';
    return (change > 0 ? '+' : '') + change.toFixed(2);
  };
  
  const getChangeClass = (change: number) => {
    if (!change) return 'text-gray-400';
    return change > 0 ? 'text-green-400' : 'text-red-400';
  };
  
  const formatVolume = (vol: number) => {
    if (!vol || isNaN(vol)) return '0.00';
    if (vol > 1000) return (vol / 1000).toFixed(2) + 'K';
    return vol.toFixed(2);
  };
  
  const formatLiquidity = (liq: number) => {
    if (!liq || isNaN(liq)) return '0';
    if (liq > 1000000) return (liq / 1000000).toFixed(2) + 'M';
    if (liq > 1000) return (liq / 1000).toFixed(1) + 'K';
    return liq.toFixed(0);
  };
  
  const formatAge = (minutes: number) => {
    if (!minutes) return 'Unknown';
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
    return `${(minutes / 1440).toFixed(1)}d`;
  };
  
  const formatTimestamp = (ts: number) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleTimeString();
  };
  
  const formatTradeTime = (ts: number) => {
    if (!ts) return 'N/A';
    const diff = Date.now() - ts;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(ts).toLocaleTimeString();
  };
  
  const formatTokenAmount = (amount: number) => {
    if (!amount) return '0';
    if (amount > 1000000000) return (amount / 1000000000).toFixed(2) + 'B';
    if (amount > 1000000) return (amount / 1000000).toFixed(2) + 'M';
    if (amount > 1000) return (amount / 1000).toFixed(2) + 'K';
    return amount.toFixed(0);
  };
  
  // Lifecycle
  onMounted(() => {
    fetchStreamStatus();
    fetchGlobalTrades();
    startTracking();
  });
  
  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
  </script>