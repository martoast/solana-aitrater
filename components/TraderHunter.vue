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
  <div class="space-y-6 pb-20">
    
    <!-- CONTROL PANEL -->
    <div class="bg-black/30 border border-slate-600 rounded-xl p-4">
      
      <!-- TOP ROW: MODE TOGGLE -->
      <div class="flex justify-center mb-4">
        <div class="bg-slate-900 p-1 rounded-lg flex shadow-inner w-full md:w-auto">
          <button @click="hunterMode = 'trending'" class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'trending' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'">🔥 Trending</button>
          <button @click="hunterMode = 'fresh'" class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'fresh' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'">⚡ Fresh</button>
        </div>
      </div>

      <!-- MIDDLE ROW: STATS & FILTERS -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
        <div class="text-center md:text-left">
          <h2 class="text-xl font-bold text-white" v-if="hunterMode === 'trending'">Trend Scanner</h2>
          <h2 class="text-xl font-bold text-white" v-else>Sniper Scanner</h2>
          <p class="text-xs text-slate-400">Queue: {{ processingQueue.length }}</p>
        </div>
        <div class="flex gap-2 w-full md:w-auto justify-center">
          <div class="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900 px-2 py-2 rounded border border-slate-700">
            <span>Liq></span><input type="number" v-model="minLiquidity" class="w-12 bg-transparent text-white text-right outline-none">
          </div>
          <div class="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900 px-2 py-2 rounded border border-slate-700">
            <span>Vol></span><input type="number" v-model="minVolume" class="w-12 bg-transparent text-white text-right outline-none">
          </div>
        </div>
      </div>

      <!-- BOTTOM ROW: ACTIONS -->
      <div class="flex gap-3">
          <button @click="fetchAndQueue" :disabled="loadingHunter" class="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors"><span v-if="loadingHunter" class="animate-spin">↻</span> {{ loadingHunter ? 'Loading...' : '1. Load' }}</button>
          <button @click="toggleSieve" :disabled="processingQueue.length === 0" class="flex-1 px-6 py-3 rounded-lg font-bold text-xs transition-all shadow-lg flex items-center justify-center" :class="isSieveRunning ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:opacity-50'">{{ isSieveRunning ? 'STOP' : '2. START' }}</button>
      </div>

      <!-- PROGRESS BAR -->
      <div class="bg-slate-900 rounded-full h-4 overflow-hidden relative border border-slate-700 mt-4">
          <div class="h-full bg-blue-500 transition-all duration-300 ease-linear" :style="{ width: processingQueue.length > 0 ? '100%' : '0%' }"></div>
          <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">{{ currentChecking || 'Ready' }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- VERIFIED COLUMN -->
      <div class="lg:col-span-2 space-y-4">
        <div class="flex justify-between items-center border-b border-green-900 pb-2">
          <h3 class="text-green-400 font-bold uppercase tracking-widest text-sm">✅ Verified ({{ verifiedTokens.length }})</h3>
          <button @click="refreshVerifiedPrices" :disabled="isUpdatingVerified || verifiedTokens.length === 0" class="text-xs text-slate-400 hover:text-green-400 flex items-center gap-1"><span v-if="isUpdatingVerified" class="animate-spin">↻</span> Update</button>
        </div>

        <div v-if="verifiedTokens.length === 0" class="p-10 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-slate-500">No candidates.</div>
        
        <div v-else class="grid gap-3">
          <div v-for="token in verifiedTokens" :key="token.address" 
               class="bg-slate-900 border p-4 rounded-xl transition-all shadow-lg relative overflow-hidden"
               :class="{
                 'border-yellow-400 shadow-yellow-900/20': token.aiDecision === 'BUY', 
                 'border-slate-700': !token.aiDecision || token.aiDecision === 'WAIT',
                 'border-red-900 opacity-60': token.aiDecision === 'AVOID'
               }"
          >
            <!-- AI BADGE -->
            <div v-if="token.aiDecision" class="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold rounded-bl-lg"
                 :class="token.aiDecision === 'BUY' ? 'bg-green-500 text-black' : (token.aiDecision === 'WAIT' ? 'bg-yellow-600 text-black' : 'bg-red-600 text-white')">
                 AI: {{ token.aiDecision }} ({{ token.aiScore }}%)
            </div>

            <div class="flex justify-between items-start mb-2">
              <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-12 h-12 shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold overflow-hidden border border-slate-600">
                    <img v-if="token.logoURI" :src="token.logoURI" class="w-full h-full object-cover" />
                    <span v-else>{{ token.symbol?.substring(0,2) }}</span>
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-lg flex items-center gap-2">
                    <span class="truncate">{{ token.symbol }}</span>
                    <span v-if="token.isNew" class="text-[10px] text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-700 whitespace-nowrap">{{ formatTimeAgo(token.liquidityAddedAt) }}</span>
                    <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-500 hover:text-white text-xs">↗</a>
                  </div>
                  <div class="flex gap-1 mt-1 overflow-x-auto">
                    <a v-if="token.socials?.website" :href="token.socials.website" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded font-bold">🌐</a>
                    <a v-if="token.socials?.twitter" :href="token.socials.twitter" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-black hover:bg-gray-800 text-white px-2 py-1 rounded font-bold border border-slate-700">𝕏</a>
                    <a v-if="token.socials?.telegram" :href="token.socials.telegram" target="_blank" class="shrink-0 flex items-center gap-1 text-[10px] bg-blue-500 hover:bg-blue-400 text-white px-2 py-1 rounded font-bold">TG</a>
                  </div>
                </div>
              </div>
              
              <!-- METRICS -->
              <div class="text-right flex flex-col gap-1 mt-6">
                <div class="flex items-center justify-end gap-1">
                    <span class="text-[10px] text-slate-400 uppercase">5m</span>
                    <span class="font-mono font-bold text-xs" :class="(token.priceChange5m || 0) > 0 ? 'text-green-400' : 'text-red-400'">{{ (token.priceChange5m || 0).toFixed(1) }}%</span>
                </div>
                 <div class="flex items-center justify-end gap-1">
                    <span class="text-[10px] text-slate-400 uppercase">1h</span>
                    <span class="font-mono font-bold text-xs" :class="(token.priceChange1h || 0) > 0 ? 'text-green-400' : 'text-red-400'">{{ (token.priceChange1h || 0).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
            
            <!-- AI REASON -->
            <div v-if="token.aiReason" class="mb-3 text-xs text-slate-300 italic border-l-2 border-slate-600 pl-2 leading-tight opacity-80 line-clamp-2">
               "{{ token.aiReason }}"
            </div>

            <div class="grid grid-cols-2 gap-2 mb-3 bg-black/20 p-2 rounded text-xs border border-slate-800">
              <div class="flex justify-between"><span class="text-slate-500">Liq</span> <span class="font-mono text-green-300">{{ formatVal(token.liquidity) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Vol</span> <span class="font-mono text-blue-300">{{ formatVal(token.v24hUSD) }}</span></div>
            </div>
            
            <div class="flex gap-2">
              <button @click="analyzeToken(token)" :disabled="processingId === token.address" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-sm disabled:opacity-50 shadow-lg">
                {{ processingId === token.address ? '...' : '🔍 Re-Scan' }}
              </button>
              <button @click="openBuyModal(token)" class="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm shadow-lg">
                🚀 Trade
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- REJECTED COLUMN -->
      <div class="lg:col-span-1">
        <h3 class="text-slate-500 font-bold uppercase tracking-widest text-sm border-b border-slate-800 pb-2">🗑️ Rejected ({{ rejectedTokens.length }})</h3>
        <div class="bg-black/20 rounded-xl border border-slate-800 h-[300px] lg:h-[500px] overflow-y-auto p-2">
          <div v-for="(token, i) in rejectedTokens" :key="i" class="flex justify-between items-center py-2 border-b border-slate-800/50 text-xs">
             <div class="flex items-center gap-2 overflow-hidden">
               <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-400 hover:text-white flex items-center gap-1 min-w-0">
                 <span class="font-bold truncate max-w-[80px]">{{ token.symbol }}</span>
                 <span class="text-[10px]">↗</span>
               </a>
             </div>
             <div class="text-right">
               <span class="text-[10px] text-red-400 block">{{ token.rejectReason }}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>