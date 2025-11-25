<script setup lang="ts">
// --- 1. WALLET INITIALIZATION ---
import { Buffer } from 'buffer'
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer
}

import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { initWallet } from 'solana-wallets-vue'
import 'solana-wallets-vue/styles.css'

initWallet({
  wallets: [new PhantomWalletAdapter()],
  autoConnect: true,
})

// --- 2. IMPORTS ---
import { useTrader } from '~/composables/useTrader'
import { onMounted, onUnmounted, ref, nextTick, watch, computed } from 'vue'

// --- 3. TRADER STATE ---
const { 
  isAutoTrading, 
  startGodMode, 
  stopGodMode,
  botSettings, 
  botLogs,
  totalPortfolioValue, 
  totalPnL, 
  activeTrades, 
  tradeHistory, 
  historyStats,
  currentChecking, 
  discoveryQueue,
  verifiedTokens,
  refreshPortfolioPrices,
  fetchPortfolio,
  closePosition,
  openBuyModal,
  executeBuy,
  showBuyModal,
  selectedToken,
  buyAmount,
  isBuying,
  formatVal,
  formatPrice,
  formatTimeAgo,
  stats,
  isScoringRunning,
  isSieveRunning,
  getExplorerLink
} = useTrader()

// --- 4. LOCAL STATE ---
const logsContainer = ref<HTMLElement | null>(null)
const lastLogCount = ref(0)
const isInitialized = ref(false)
const activeTerminalTab = ref<'logs' | 'verified' | 'portfolio'>('logs')
const showSettings = ref(false)
const showWeights = ref(false)

// --- 5. RUNNING TIME ---
const runningTime = ref(0)
let runningTimer: ReturnType<typeof setInterval> | null = null

const formattedRunningTime = computed(() => {
  const hrs = Math.floor(runningTime.value / 3600)
  const mins = Math.floor((runningTime.value % 3600) / 60)
  const secs = runningTime.value % 60
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

// --- 6. AUTO-SCROLL LOGS ---
watch(botLogs, async () => {
  if (botLogs.value.length > lastLogCount.value) {
    await nextTick()
    if (logsContainer.value && activeTerminalTab.value === 'logs') {
      logsContainer.value.scrollTop = 0 
    }
  }
  lastLogCount.value = botLogs.value.length
}, { deep: true })

// --- 7. LIFECYCLE ---
onMounted(async () => {
  await fetchPortfolio() // Load DB immediately
  isInitialized.value = true
})

onUnmounted(() => {
  if (runningTimer) clearInterval(runningTimer)
})

// --- 8. CONTROLS ---
const toggleBot = () => {
  if (isAutoTrading.value) {
    stopGodMode()
    if (runningTimer) {
      clearInterval(runningTimer)
      runningTimer = null
    }
  } else {
    runningTime.value = 0
    startGodMode()
    runningTimer = setInterval(() => runningTime.value++, 1000)
  }
}

const emergencyStop = () => {
  stopGodMode()
  if (runningTimer) {
    clearInterval(runningTimer)
    runningTimer = null
  }
}

const manualSell = async (trade: any) => {
  if (confirm(`Sell ${trade.symbol} now?`)) {
    await closePosition(trade, 'Manual Sell')
  }
}

const manualBuy = (token: any) => {
  openBuyModal(token)
}

// --- 9. HELPERS ---
const getLogClass = (log: string) => {
  if (log.includes('✅') || log.includes('BUY:')) return 'text-green-400'
  if (log.includes('❌') || log.includes('error') || log.includes('failed')) return 'text-red-400'
  if (log.includes('⚠️') || log.includes('STOPPED')) return 'text-yellow-400'
  if (log.includes('📡')) return 'text-cyan-400'
  if (log.includes('💰') || log.includes('SELL:')) return 'text-orange-400'
  if (log.includes('🎯')) return 'text-pink-400'
  return 'text-green-500'
}

const getPnLClass = (pnl: number) => pnl >= 0 ? 'text-green-400' : 'text-red-500'

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-400 bg-green-500/20 border-green-500'
  if (score >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500'
  if (score >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500'
  return 'text-red-400 bg-red-500/20 border-red-500'
}

const getSignalBadge = (signal: string) => {
  if (signal === 'BUY') return 'bg-green-500 text-black'
  if (signal === 'AVOID') return 'bg-red-500 text-white'
  return 'bg-gray-600 text-white'
}
</script>

<template>
  <div class="min-h-screen bg-black text-green-500 font-mono selection:bg-green-900 selection:text-white flex flex-col">
    
    <!-- BUY MODAL -->
    <div v-if="showBuyModal && selectedToken" class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-gray-900 border border-green-600 w-full max-w-sm rounded-xl p-5">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-bold text-white">Buy {{ selectedToken.symbol }}</h3>
            <p class="text-xs text-green-600">${{ formatPrice(selectedToken.price) }} • Score: {{ selectedToken.score || '?' }}</p>
          </div>
          <button @click="showBuyModal = false" class="text-gray-500 hover:text-white text-xl">×</button>
        </div>
        
        <div class="mb-4">
          <label class="text-xs text-green-700 uppercase mb-1 block">Amount ($)</label>
          <input 
            type="number" 
            v-model.number="buyAmount" 
            class="w-full bg-black border border-green-800 rounded-lg py-3 px-4 text-xl font-bold text-green-400 focus:border-green-500 outline-none"
          >
          <div class="flex gap-2 mt-2">
            <button @click="buyAmount = 10" class="flex-1 py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded text-xs">$10</button>
            <button @click="buyAmount = 25" class="flex-1 py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded text-xs">$25</button>
            <button @click="buyAmount = 50" class="flex-1 py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded text-xs">$50</button>
            <button @click="buyAmount = 100" class="flex-1 py-1.5 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded text-xs">$100</button>
          </div>
        </div>
        
        <button 
          @click="executeBuy" 
          :disabled="isBuying"
          class="w-full py-3 rounded-lg font-bold bg-green-600 hover:bg-green-500 text-black transition-all disabled:opacity-50"
        >
          {{ isBuying ? 'Buying...' : `Buy $${buyAmount}` }}
        </button>
      </div>
    </div>

    <!-- HEADER (REAL STATS) -->
    <header class="bg-black/90 border-b border-green-900 px-4 py-2.5 sticky top-0 z-40 backdrop-blur-sm">
      <div class="max-w-7xl mx-auto flex justify-between items-center">
        
        <!-- Left -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div 
              class="w-2 h-2 rounded-full" 
              :class="isAutoTrading ? 'bg-green-500 animate-pulse' : 'bg-red-500'"
            ></div>
            <h1 class="text-base font-bold">ALEX<span class="animate-pulse">_</span>BOT</h1>
          </div>
          <span v-if="isAutoTrading" class="text-[9px] px-1.5 py-0.5 rounded bg-green-900/50 border border-green-700 text-green-400">
            {{ formattedRunningTime }}
          </span>
        </div>
        
        <!-- Center Stats (YOUR REQUESTED STATS) -->
        <div class="hidden md:flex items-center gap-6 text-[10px]">
          <div class="text-center">
            <div class="text-green-700">REALIZED</div>
            <div class="font-bold" :class="getPnLClass(historyStats?.realizedPnL || 0)">
              ${{ (historyStats?.realizedPnL || 0).toFixed(2) }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-green-700">TRADES</div>
            <div class="font-bold text-white">{{ historyStats?.totalTrades || 0 }}</div>
          </div>
          <div class="text-center">
            <div class="text-green-700">WIN%</div>
            <div class="font-bold text-white">{{ (historyStats?.winRate || 0).toFixed(0) }}%</div>
          </div>
          <div class="text-center">
            <div class="text-green-700">ACTIVE</div>
            <div class="font-bold text-white">{{ activeTrades?.length || 0 }}/{{ botSettings.maxPositions }}</div>
          </div>
        </div>
        
        <!-- Right Controls -->
        <div class="flex items-center gap-2">
          
          
          <button 
            v-if="isAutoTrading"
            @click="emergencyStop"
            class="px-3 py-1.5 bg-red-900/50 border border-red-600 hover:bg-red-600 text-red-400 hover:text-white rounded text-[10px] font-bold uppercase"
          >STOP</button>
          
          <button 
            @click="toggleBot"
            :disabled="!isInitialized"
            class="px-4 py-1.5 border rounded text-[10px] font-bold uppercase transition-all disabled:opacity-50"
            :class="isAutoTrading 
              ? 'bg-red-900/30 border-red-500 text-red-400 hover:bg-red-600 hover:text-white' 
              : 'bg-green-900/30 border-green-500 text-green-400 hover:bg-green-600 hover:text-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'"
          >
            {{ !isInitialized ? '...' : (isAutoTrading ? 'TERMINATE' : 'START') }}
          </button>
        </div>
      </div>
    </header>

    <!-- MAIN -->
    <main class="flex-1 p-3 max-w-7xl mx-auto w-full">
      
      <!-- SETTINGS PANEL -->
      <Transition name="slide">
        <div v-if="showSettings || !isAutoTrading" class="mb-3 bg-green-900/10 border border-green-900/50 rounded-lg p-3">
          
          <!-- Basic Settings -->
          <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
            <label class="flex flex-col">
              <span class="text-[8px] text-green-700 uppercase mb-0.5">Bet $</span>
              <input type="number" v-model.number="botSettings.buyAmount" class="bg-black border border-green-800 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-[8px] text-green-700 uppercase mb-0.5">TP %</span>
              <input type="number" v-model.number="botSettings.takeProfit" class="bg-black border border-green-800 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-[8px] text-green-700 uppercase mb-0.5">SL %</span>
              <input type="number" v-model.number="botSettings.stopLoss" class="bg-black border border-green-800 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-[8px] text-green-700 uppercase mb-0.5">Max Pos</span>
              <input type="number" v-model.number="botSettings.maxPositions" class="bg-black border border-green-800 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-[8px] text-green-700 uppercase mb-0.5">Min Score</span>
              <input type="number" v-model.number="botSettings.minScore" class="bg-black border border-green-800 rounded px-2 py-1 text-xs text-green-400 focus:border-green-500 outline-none">
            </label>
            <div class="flex items-end">
              <button 
                @click="showWeights = !showWeights" 
                class="w-full py-1 text-[9px] bg-purple-900/30 hover:bg-purple-900/50 border border-purple-800 rounded text-purple-400"
              >
                {{ showWeights ? 'Hide' : 'Weights' }} ⚖️
              </button>
            </div>
          </div>
          
          <!-- Advanced Weights -->
          <Transition name="slide">
            <div v-if="showWeights" class="grid grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-green-900/50">
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">5m Weight</span>
                <input type="number" v-model.number="botSettings.weights.priceChange5m" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">1h Weight</span>
                <input type="number" v-model.number="botSettings.weights.priceChange1h" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">Align Wt</span>
                <input type="number" v-model.number="botSettings.weights.alignment" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">Buy Press</span>
                <input type="number" v-model.number="botSettings.weights.buyPressure" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">Volume Wt</span>
                <input type="number" v-model.number="botSettings.weights.volumeSpike" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
              <label class="flex flex-col">
                <span class="text-[8px] text-purple-600 uppercase mb-0.5">Liq Wt</span>
                <input type="number" v-model.number="botSettings.weights.liquidityHealth" class="bg-black border border-purple-800 rounded px-2 py-1 text-xs text-purple-400 focus:border-purple-500 outline-none">
              </label>
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- MAIN GRID -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        
        <!-- LEFT: TERMINAL -->
        <div class="lg:col-span-2 flex flex-col bg-black border border-green-900 rounded-lg overflow-hidden" style="min-height: 480px;">
          
          <!-- Tabs -->
          <div class="bg-green-900/20 border-b border-green-900 flex">
            <button 
              @click="activeTerminalTab = 'logs'"
              class="flex-1 py-1.5 px-2 text-[9px] font-bold uppercase border-b-2 transition-all"
              :class="activeTerminalTab === 'logs' ? 'border-green-500 text-green-400 bg-green-900/20' : 'border-transparent text-green-700'"
            >Logs ({{ botLogs?.length || 0 }})</button>
            <button 
              @click="activeTerminalTab = 'verified'"
              class="flex-1 py-1.5 px-2 text-[9px] font-bold uppercase border-b-2 transition-all"
              :class="activeTerminalTab === 'verified' ? 'border-cyan-500 text-cyan-400 bg-cyan-900/20' : 'border-transparent text-green-700'"
            >Watching ({{ verifiedTokens?.length || 0 }})</button>
            <button 
              @click="activeTerminalTab = 'portfolio'"
              class="flex-1 py-1.5 px-2 text-[9px] font-bold uppercase border-b-2 transition-all"
              :class="activeTerminalTab === 'portfolio' ? 'border-orange-500 text-orange-400 bg-orange-900/20' : 'border-transparent text-green-700'"
            >Portfolio ({{ tradeHistory?.length || 0 }})</button>
          </div>
          
          <!-- LOGS TAB -->
          <div 
            v-show="activeTerminalTab === 'logs'"
            ref="logsContainer" 
            class="flex-1 p-2 overflow-y-auto text-[10px]"
            style="max-height: 400px;"
          >
            <div v-if="!botLogs?.length" class="text-green-900 italic py-6 text-center">
              Ready. Click START to begin...
            </div>
            <div v-else class="space-y-0.5">
              <div 
                v-for="(log, i) in botLogs" 
                :key="i" 
                class="py-0.5 px-1 hover:bg-green-900/10 rounded"
                :class="getLogClass(log)"
              >{{ log }}</div>
            </div>
          </div>
          
          <!-- WATCHING TAB -->
          <div 
            v-show="activeTerminalTab === 'verified'"
            class="flex-1 p-2 overflow-y-auto"
            style="max-height: 400px;"
          >
            <div v-if="!verifiedTokens?.length" class="text-green-900 italic py-6 text-center text-xs">
              No tokens being watched...
            </div>
            <div v-else class="space-y-1.5">
              <div 
                v-for="token in verifiedTokens" 
                :key="token.address"
                class="bg-gray-900/50 border rounded p-2 flex items-center gap-2"
                :class="token.signal === 'BUY' ? 'border-green-600' : 'border-gray-800'"
              >
                <!-- Logo -->
                <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0 text-[8px]">
                  <img v-if="token.logoURI" :src="token.logoURI" class="w-full h-full object-cover" @error="(e: any) => e.target.style.display='none'" />
                  <span v-else>{{ token.symbol?.slice(1,3) }}</span>
                </div>
                
                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs text-white truncate">{{ token.symbol }}</span>
                    <a :href="`https://dexscreener.com/solana/${token.address}`" target="_blank" class="text-green-700 hover:text-green-400 text-[9px]">↗</a>
                    <span 
                      class="text-[8px] px-1 py-0.5 rounded font-bold"
                      :class="getSignalBadge(token.signal)"
                    >{{ token.signal }}</span>
                  </div>
                  <div class="text-[9px] text-gray-500 flex gap-2">
                    <span>{{ formatVal(token.liquidity) }}</span>
                    <span>{{ token.scoreHistory?.length || 0 }} checks</span>
                  </div>
                </div>
                
                <!-- Momentum -->
                <div class="text-right text-[9px]">
                  <div :class="(token.priceChange5m || 0) > 0 ? 'text-green-400' : 'text-red-400'">
                    5m: {{ (token.priceChange5m || 0) > 0 ? '+' : '' }}{{ (token.priceChange5m || 0).toFixed(1) }}%
                  </div>
                  <div :class="(token.priceChange1h || 0) > 0 ? 'text-green-600' : 'text-red-600'">
                    1h: {{ (token.priceChange1h || 0) > 0 ? '+' : '' }}{{ (token.priceChange1h || 0).toFixed(1) }}%
                  </div>
                </div>
                
                <!-- Score -->
                <div 
                  class="px-2 py-1 rounded border text-xs font-bold text-center min-w-[40px]"
                  :class="getScoreColor(token.score || 0)"
                >
                  {{ token.score || 0 }}
                </div>
                
                <!-- Manual Buy -->
                <button 
                  @click="manualBuy(token)"
                  class="px-2 py-1 bg-green-900/30 hover:bg-green-600 border border-green-700 rounded text-[9px] text-green-400 hover:text-black transition-all"
                >Buy</button>
              </div>
            </div>
          </div>
          
          <!-- PORTFOLIO/HISTORY TAB -->
          <div 
            v-show="activeTerminalTab === 'portfolio'"
            class="flex-1 p-2 overflow-y-auto"
            style="max-height: 400px;"
          >
            <!-- Summary Stats -->
             <div class="flex gap-4 mb-2 pb-2 border-b border-green-900/30">
                <div class="bg-green-900/10 px-2 py-1 rounded border border-green-900/50 flex items-center gap-2">
                   <span class="text-[9px] text-green-700 uppercase">Avg ROI</span>
                   <span class="font-bold text-xs" :class="(historyStats?.avgReturn || 0) >= 0 ? 'text-green-400' : 'text-red-400'">{{ (historyStats?.avgReturn || 0).toFixed(1) }}%</span>
                </div>
             </div>

            <div v-if="!tradeHistory?.length" class="text-green-900 italic py-6 text-center text-xs">
              No closed trades history...
            </div>
            
            <div v-else class="rounded overflow-hidden border border-green-900/30">
              <table class="w-full text-left text-[10px]">
                <thead class="bg-green-900/20 text-green-700 uppercase">
                  <tr>
                    <th class="p-2 font-normal">Token</th>
                    <th class="p-2 text-right font-normal">Invested</th>
                    <th class="p-2 text-right font-normal">ROI</th>
                    <th class="p-2 text-right font-normal">PnL</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-green-900/30">
                  <tr v-for="trade in tradeHistory" :key="trade.id" class="hover:bg-green-900/10 transition-colors">
                    <td class="p-2 flex items-center gap-2">
                      <a :href="getExplorerLink(trade.address)" target="_blank" class="flex items-center gap-2 hover:text-white transition-colors group">
                        <div class="w-4 h-4 rounded-full bg-green-900/50 overflow-hidden">
                          <img v-if="trade.logoURI" :src="trade.logoURI" class="w-full h-full object-cover opacity-70 group-hover:opacity-100" />
                        </div>
                        <span class="font-bold text-green-400 group-hover:text-white">{{ trade.symbol }}</span>
                        <span class="text-[8px] text-green-800">↗</span>
                      </a>
                    </td>
                    <td class="p-2 text-right font-mono text-green-600">${{ trade.amount }}</td>
                    <td class="p-2 text-right font-mono">
                         {{ (((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2) }}%
                    </td>
                    <td class="p-2 text-right font-mono font-bold" :class="(trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'">
                        {{ (trade.pnl || 0) >= 0 ? '+' : '' }}${{ (trade.pnl || 0).toFixed(2) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Status Bar -->
          <div class="bg-green-900/10 p-1.5 border-t border-green-900 text-[9px] flex justify-between items-center px-2">
            <span class="text-green-600 truncate">{{ currentChecking || 'Idle' }}</span>
            <div class="flex items-center gap-2">
              <span class="text-green-800">{{ stats?.lastScoringTime || 0 }}ms</span>
              <span v-if="isAutoTrading" class="flex items-center gap-1 text-green-500">
                <span class="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                LIVE
              </span>
            </div>
          </div>
        </div>
        
        <!-- RIGHT: ACTIVE POSITIONS -->
        <div class="flex flex-col bg-black border border-green-900 rounded-lg overflow-hidden">
          <div class="bg-green-900/20 p-2 border-b border-green-900 flex justify-between items-center">
            <span class="text-[9px] font-bold uppercase">Active Positions ({{ activeTrades?.length || 0 }})</span>
            <button @click="refreshPortfolioPrices" class="text-[8px] text-green-700 hover:text-green-400">↻</button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-2" style="max-height: 480px;">
            <div v-if="!activeTrades?.length" class="text-center py-8 text-green-900 text-xs">
              <div class="text-lg mb-1">📭</div>
              No open positions
              <div class="text-[9px] mt-1 text-green-800">
                {{ isAutoTrading ? 'Scanning...' : 'Start bot to trade' }}
              </div>
            </div>
            
            <div v-else class="space-y-2">
              <div 
                v-for="trade in activeTrades" 
                :key="trade.id" 
                class="border border-green-900 p-2 rounded bg-green-900/5"
              >
                <div class="flex justify-between items-start mb-1">
                  <div>
                    <div class="font-bold text-green-400 text-xs flex items-center gap-1">
                      {{ trade.symbol }}
                      <a :href="`https://dexscreener.com/solana/${trade.address}`" target="_blank" class="text-green-700 hover:text-green-400 text-[8px]">↗</a>
                    </div>
                    <div class="text-[8px] text-green-700">${{ formatPrice(trade.entryPrice) }} • ${{ trade.amount }}</div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold text-sm" :class="getPnLClass(trade.pnlPercent || 0)">
                      {{ (trade.pnlPercent || 0) >= 0 ? '+' : '' }}{{ (trade.pnlPercent || 0).toFixed(2) }}%
                    </div>
                    <div class="text-[8px] text-green-700">${{ (trade.currentValue || trade.amount).toFixed(2) }}</div>
                  </div>
                </div>
                
                <!-- Progress -->
                <div class="mb-1.5">
                  <div class="flex justify-between text-[7px] text-green-700 mb-0.5">
                    <span>-{{ botSettings.stopLoss }}%</span>
                    <span>+{{ botSettings.takeProfit }}%</span>
                  </div>
                  <div class="h-1 bg-green-900/30 rounded-full relative overflow-hidden">
                    <div class="absolute left-1/2 top-0 bottom-0 w-px bg-green-700"></div>
                    <div 
                      class="h-full absolute transition-all"
                      :class="(trade.pnlPercent || 0) >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'"
                      :style="{ width: Math.min(50, Math.abs(trade.pnlPercent || 0) / Math.max(botSettings.takeProfit, botSettings.stopLoss) * 50) + '%' }"
                    ></div>
                  </div>
                </div>
                
                <button 
                  @click="manualSell(trade)"
                  class="w-full py-1 text-[8px] font-bold uppercase bg-red-900/30 hover:bg-red-600 border border-red-900 rounded text-red-400 hover:text-white transition-all"
                >Sell</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- FOOTER -->
    <footer class="border-t border-green-900 p-2 bg-black/50">
      <div class="max-w-7xl mx-auto flex justify-between items-center text-[9px]">
        <NuxtLink to="/" class="text-green-800 hover:text-green-500">← Manual Mode</NuxtLink>
        <div class="text-green-900">
          ${{ botSettings.buyAmount }} • {{ botSettings.takeProfit }}%TP • {{ botSettings.stopLoss }}%SL • {{ botSettings.minScore }}+score
        </div>
        <div class="text-green-800">
          Cycles: {{ stats?.scoringCycles || 0 }}
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #001a00; }
::-webkit-scrollbar-thumb { background: #14532d; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #166534; }

.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; }
.slide-enter-to, .slide-leave-from { opacity: 1; max-height: 300px; }
</style>