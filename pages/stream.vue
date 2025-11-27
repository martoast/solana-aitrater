<script setup lang="ts">
/**
 * Stream Page - Live Trades Feed
 */

const recentTrades = ref<any[]>([]);
const isLoading = ref(true);

let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function fetchTrades() {
  try {
    const res = await fetch('/api/stream/trades?global=true&limit=100');
    const json = await res.json();
    if (json.success) {
      recentTrades.value = json.data || [];
    }
  } catch (e) {
    console.error('Failed to fetch trades:', e);
  } finally {
    isLoading.value = false;
  }
}

function formatSOL(amount: number): string {
  if (!amount) return '0';
  return amount.toFixed(4);
}

function formatPrice(price: number): string {
  if (!price) return '$0';
  if (price < 0.0000001) return price.toExponential(2);
  if (price < 0.0001) return price.toFixed(10);
  return price.toFixed(8);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function truncate(str: string, len = 8): string {
  if (!str) return '';
  return `${str.slice(0, len)}...${str.slice(-4)}`;
}

onMounted(() => {
  fetchTrades();
  refreshTimer = setInterval(fetchTrades, 1000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white p-6">
    <div class="max-w-6xl mx-auto">
      
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-bold flex items-center gap-3">
          <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
          Live Trades Feed
        </h1>
        <span class="text-sm text-gray-500">{{ recentTrades.length }} trades</span>
      </div>
      
      <!-- Loading -->
      <div v-if="isLoading" class="text-center py-20 text-gray-500">
        Loading trades...
      </div>
      
      <!-- Trades Table -->
      <div v-else class="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
        <table class="w-full text-sm">
          <thead class="bg-gray-800 text-gray-400 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Time</th>
              <th class="px-4 py-3 text-left">Type</th>
              <th class="px-4 py-3 text-left">Token</th>
              <th class="px-4 py-3 text-right">SOL</th>
              <th class="px-4 py-3 text-right">Price</th>
              <th class="px-4 py-3 text-left">Trader</th>
              <th class="px-4 py-3 text-center">Links</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            <tr 
              v-for="trade in recentTrades" 
              :key="trade.signature"
              class="hover:bg-gray-800/50 transition-colors"
            >
              <td class="px-4 py-3 text-gray-400 font-mono text-xs">
                {{ formatTime(trade.timestamp) }}
              </td>
              <td class="px-4 py-3">
                <span 
                  class="px-2 py-1 rounded text-xs font-bold"
                  :class="trade.isBuy ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'"
                >
                  {{ trade.isBuy ? 'BUY' : 'SELL' }}
                </span>
              </td>
              <td class="px-4 py-3 font-mono text-xs">
                {{ truncate(trade.mint) }}
              </td>
              <td class="px-4 py-3 text-right text-yellow-400 font-mono">
                ◎ {{ formatSOL(trade.solAmount) }}
              </td>
              <td class="px-4 py-3 text-right text-gray-300 font-mono text-xs">
                {{ formatPrice(trade.price) }}
              </td>
              <td class="px-4 py-3 font-mono text-xs text-gray-500">
                {{ truncate(trade.trader, 6) }}
              </td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2">
                  <a 
                    :href="`https://solscan.io/tx/${trade.signature}`"
                    target="_blank"
                    class="text-cyan-500 hover:text-cyan-400 text-xs"
                  >
                    TX
                  </a>
                  <a 
                    :href="`https://pump.fun/coin/${trade.mint}`"
                    target="_blank"
                    class="text-pink-500 hover:text-pink-400 text-xs"
                  >
                    Pump
                  </a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
    </div>
  </div>
</template>