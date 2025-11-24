<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTrader } from '~/composables/useTrader'

const { 
  totalPortfolioValue, totalPnL, activeTrades, isRefreshing, 
  refreshPortfolioPrices, processingId, askAiToManage, closePosition,
  tradeHistory, historyStats, getExplorerLink, startPortfolioMonitor, stopPortfolioMonitor 
} = useTrader()

onMounted(() => {
  startPortfolioMonitor()
})

onUnmounted(() => {
  stopPortfolioMonitor()
})
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- (Template code remains exactly the same as previous successful version) -->
    <!-- PNL SUMMARY CARDS -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-black/20 p-4 rounded-xl border border-slate-700">
        <div class="text-xs text-slate-400 uppercase mb-1">Total Equity</div>
        <div class="text-2xl font-bold text-white">${{ totalPortfolioValue.toFixed(2) }}</div>
      </div>
      <div class="bg-black/20 p-4 rounded-xl border border-slate-700">
        <div class="text-xs text-slate-400 uppercase mb-1">Total PnL</div>
        <div class="text-2xl font-bold" :class="totalPnL >= 0 ? 'text-green-400' : 'text-red-400'">{{ totalPnL >= 0 ? '+' : '' }}${{ totalPnL.toFixed(2) }}</div>
      </div>
      <div class="bg-black/20 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
          <div class="text-xs text-slate-400 uppercase">Active Trades</div>
          <div class="text-3xl font-bold text-white">{{ activeTrades.length }}</div>
      </div>
    </div>

    <!-- ACTIVE TRADES -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-2">
        <h2 class="text-xl font-bold text-white">Open Positions</h2>
        <span v-if="isRefreshing" class="text-xs text-green-400 animate-pulse">● Live</span>
      </div>
      <button @click="refreshPortfolioPrices" :disabled="isRefreshing" class="text-xs text-purple-400 hover:text-white flex items-center gap-1">Force Refresh</button>
    </div>

    <div v-if="activeTrades.length === 0" class="text-center py-12 text-slate-500 bg-black/20 rounded-xl">No active trades. Go hunt!</div>
    
    <div v-else class="grid gap-3">
      <div v-for="trade in activeTrades" :key="trade.id" class="bg-black/20 p-4 rounded-xl border border-slate-600 hover:bg-slate-800/50 transition-colors">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-3">
            <a :href="getExplorerLink(trade.address)" target="_blank" class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs overflow-hidden hover:opacity-80 transition-opacity border border-slate-600">
                <img v-if="trade.logoURI" :src="trade.logoURI" class="w-full h-full object-cover" />
                <span v-else>{{ trade.symbol.substring(0,2) }}</span>
            </a>
            <div>
              <a :href="getExplorerLink(trade.address)" target="_blank" class="font-bold text-white text-lg hover:text-purple-400 transition-colors flex items-center gap-1">
                {{ trade.symbol }}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 opacity-50"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" /></svg>
              </a>
              <div class="text-xs text-slate-400">Entry: ${{ trade.entryPrice.toFixed(8) }}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xl font-mono font-bold" :class="(trade.pnlPercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'">{{ (trade.pnlPercent || 0) >= 0 ? '+' : '' }}{{ (trade.pnlPercent || 0).toFixed(2) }}%</div>
            <div class="text-xs text-slate-400 font-mono" v-if="trade.currentValue">${{ trade.currentValue.toFixed(2) }}</div>
            <div class="text-xs text-slate-500" v-else>Fetching Price...</div>
          </div>
        </div>
        <div class="flex gap-2 border-t border-slate-700 pt-3">
          <button @click="askAiToManage(trade)" :disabled="processingId === trade.id" class="flex-1 py-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded text-xs font-bold border border-blue-900 flex items-center justify-center gap-2">
             <span v-if="processingId === trade.id" class="animate-spin">↻</span> Check AI
          </button>
          <button @click="closePosition(trade)" class="flex-1 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs font-bold border border-red-900">Sell Position</button>
        </div>
      </div>
    </div>

    <!-- HISTORY -->
    <div v-if="tradeHistory.length > 0" class="mt-8 pt-8 border-t border-slate-700">
      <div class="flex items-center justify-between mb-4">
         <h3 class="text-lg font-bold text-slate-400">Trade History</h3>
         <div class="flex gap-4 text-sm">
            <div class="bg-black/40 px-3 py-1 rounded border border-slate-700">
               <span class="text-slate-500 mr-2">Net Profit</span>
               <span class="font-bold font-mono" :class="historyStats.realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'">{{ historyStats.realizedPnL >= 0 ? '+' : '' }}${{ historyStats.realizedPnL.toFixed(2) }}</span>
            </div>
            <div class="bg-black/40 px-3 py-1 rounded border border-slate-700">
               <span class="text-slate-500 mr-2">Avg ROI</span>
               <span class="font-bold" :class="historyStats.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'">{{ historyStats.avgReturn.toFixed(1) }}%</span>
            </div>
         </div>
      </div>
      
      <div class="bg-black/20 rounded-xl border border-slate-800 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase bg-slate-900/50 text-slate-500">
            <tr><th class="p-3">Token</th><th class="p-3 text-right">Invested</th><th class="p-3 text-right">ROI</th><th class="p-3 text-right">PnL</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            <tr v-for="trade in tradeHistory" :key="trade.id" class="text-slate-400 hover:bg-slate-800/30 transition-colors">
              <td class="p-3 flex items-center gap-2">
                <a :href="getExplorerLink(trade.address)" target="_blank" class="flex items-center gap-2 hover:text-white transition-colors">
                  <div class="w-5 h-5 rounded-full bg-slate-700 overflow-hidden">
                    <img v-if="trade.logoURI" :src="trade.logoURI" class="w-full h-full object-cover grayscale opacity-50" />
                  </div>
                  <span class="font-bold">{{ trade.symbol }}</span>
                  <span class="text-xs text-slate-600">↗</span>
                </a>
              </td>
              <td class="p-3 text-right font-mono">${{ trade.amount }}</td>
              <td class="p-3 text-right font-mono text-xs">{{ (((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2) }}%</td>
              <td class="p-3 text-right font-mono font-bold" :class="trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'">{{ trade.pnl >= 0 ? '+' : '' }}${{ trade.pnl.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>