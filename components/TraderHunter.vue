<script setup lang="ts">
import { useTrader } from '~/composables/useTrader'

const { 
  hunterMode, minLiquidity, minVolume, loadingHunter, processingQueue, 
  isSieveRunning, currentChecking, verifiedTokens, rejectedTokens, isUpdatingVerified, 
  processingId, fetchAndQueue, toggleSieve, refreshVerifiedPrices, 
  analyzeToken, openBuyModal, formatVal, getExplorerLink, formatTimeAgo 
} = useTrader()
</script>

<template>
  <div class="space-y-6">
    
    <!-- CONTROL PANEL -->
    <div class="bg-black/30 border border-slate-600 rounded-xl p-4">
      
      <!-- Mobile: Stacked Buttons / Desktop: Row -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
        
        <!-- Mode Toggle -->
        <div class="bg-slate-900 p-1 rounded-lg flex shadow-inner w-full md:w-auto">
          <button @click="hunterMode = 'trending'" class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'trending' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'">🔥 Trending</button>
          <button @click="hunterMode = 'fresh'" class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'fresh' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'">⚡ Fresh</button>
        </div>

        <!-- Filters & Actions -->
        <div class="flex flex-wrap justify-center gap-3 w-full md:w-auto">
          <div class="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-700">
            <span>Liq ></span>
            <input type="number" v-model="minLiquidity" class="w-16 bg-transparent text-white outline-none text-right">
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-700">
            <span>Vol ></span>
            <input type="number" v-model="minVolume" class="w-16 bg-transparent text-white outline-none text-right">
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3 mb-4">
         <button @click="fetchAndQueue" :disabled="loadingHunter" class="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors">
            <span v-if="loadingHunter" class="animate-spin">↻</span> {{ loadingHunter ? 'Loading...' : '1. Load Batch' }}
         </button>
         <button @click="toggleSieve" :disabled="processingQueue.length === 0" class="flex-1 px-6 py-3 rounded-lg font-bold text-xs transition-all shadow-lg" :class="isSieveRunning ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:opacity-50'">
            {{ isSieveRunning ? 'STOP CHECK' : '2. START CHECK' }}
         </button>
      </div>

      <!-- Progress Bar -->
      <div class="bg-slate-900 rounded-full h-4 overflow-hidden relative border border-slate-700">
          <div class="h-full bg-blue-500 transition-all duration-300 ease-linear" :style="{ width: processingQueue.length > 0 ? '100%' : '0%' }"></div>
          <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">{{ currentChecking || 'Ready' }} ({{ processingQueue.length }})</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- VERIFIED COLUMN -->
      <div class="lg:col-span-2 space-y-4">
        <div class="flex justify-between items-center border-b border-green-900 pb-2">
          <h3 class="text-green-400 font-bold uppercase tracking-widest text-sm">✅ Verified ({{ verifiedTokens.length }})</h3>
          <button @click="refreshVerifiedPrices" :disabled="isUpdatingVerified || verifiedTokens.length === 0" class="text-xs text-slate-400 hover:text-green-400 flex items-center gap-1"><span v-if="isUpdatingVerified" class="animate-spin">↻</span> Update</button>
        </div>

        <div v-if="verifiedTokens.length === 0" class="p-10 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-slate-500">No candidates yet. Load batch and check.</div>
        
        <div v-else class="grid gap-3">
          <div v-for="token in verifiedTokens" :key="token.address" class="bg-slate-900 border border-slate-700 p-4 rounded-xl hover:border-green-500 transition-all shadow-lg">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-12 h-12 shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold overflow-hidden border border-slate-600">
                    <img v-if="token.logoURI" :src="token.logoURI" class="w-full h-full object-cover" />
                    <span v-else>{{ token.symbol?.substring(0,2) }}</span>
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-lg flex items-center gap-2">
                    <span class="truncate">{{ token.symbol }}</span>
                    <span v-if="token.isNew" class="text-[10px] text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-700 whitespace-nowrap">{{ formatTimeAgo(token.liquidityAddedAt) }}</span>
                    <span v-else class="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">#{{ token.rank }}</span>
                    <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-500 hover:text-white text-xs" title="View Chart">↗</a>
                  </div>
                  
                  <!-- Socials -->
                  <div class="flex gap-2 mt-1 overflow-x-auto">
                    <a v-if="token.socials?.website" :href="token.socials.website" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded font-bold transition-colors">🌐 Web</a>
                    <a v-if="token.socials?.twitter" :href="token.socials.twitter" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-black hover:bg-gray-800 text-white px-2 py-1 rounded font-bold transition-colors border border-slate-700">𝕏 Twit</a>
                    <a v-if="token.socials?.telegram" :href="token.socials.telegram" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-blue-500 hover:bg-blue-400 text-white px-2 py-1 rounded font-bold transition-colors">✈ TG</a>
                  </div>
                </div>
              </div>
              <div class="text-right shrink-0 pl-2">
                <div class="text-xl font-mono font-bold" :class="token.price24hChangePercent > 0 ? 'text-green-400' : 'text-red-400'">{{ token.price24hChangePercent?.toFixed(0) }}%</div>
                <div class="text-[10px] text-slate-400 uppercase">24h Chg</div>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 my-3 bg-black/20 p-3 rounded-lg text-xs border border-slate-800">
              <div class="flex justify-between"><span class="text-slate-500">Liquidity</span> <span class="font-mono text-green-300">{{ formatVal(token.liquidity) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Volume</span> <span class="font-mono text-blue-300">{{ formatVal(token.v24hUSD) }}</span></div>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex gap-2">
              <button @click="analyzeToken(token)" :disabled="processingId === token.address" class="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-sm disabled:opacity-50 shadow-lg transition-transform hover:scale-[1.02]">
                {{ processingId === token.address ? '...' : '🤖 Ask AI' }}
              </button>
              <button @click="openBuyModal(token)" class="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm shadow-lg transition-transform hover:scale-[1.02]">
                🚀 Trade
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- REJECTED COLUMN -->
      <div class="lg:col-span-1">
        <h3 class="text-slate-500 font-bold uppercase tracking-widest text-sm border-b border-slate-800 pb-2">🗑️ Rejected ({{ rejectedTokens.length }})</h3>
        <div class="bg-black/20 rounded-xl border border-slate-800 h-[500px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700">
          <div v-for="(token, i) in rejectedTokens" :key="i" class="flex justify-between items-center py-2 border-b border-slate-800/50 text-xs group hover:bg-slate-800/50 px-2 rounded transition-colors">
            <div class="flex items-center gap-2 overflow-hidden">
              <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-400 hover:text-white flex items-center gap-1 min-w-0">
                <span class="font-bold truncate max-w-[80px]">{{ token.symbol }}</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 opacity-0 group-hover:opacity-100"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" /></svg>
              </a>
            </div>
            <div class="text-right flex flex-col">
              <span class="text-[10px] text-red-400">{{ token.rejectReason }}</span>
            </div>
          </div>
          <div v-if="rejectedTokens.length === 0" class="text-center pt-10 text-slate-600 text-xs">Empty</div>
        </div>
      </div>
    </div>
  </div>
</template>