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
  startBot,
  StopBot,
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
  showSettingsModal,
  openSettingsModal,
  closeSettingsModal,
  selectedToken,
  buyAmount,
  isBuying,
  formatVal,
  formatPrice,
  formatTimeAgo,
  stats,
  isScoringRunning,
  isSieveRunning,
  getExplorerLink,
  removeFromVerified,
  queueStats,
  streamStatus,
  // Scoring Engine
  engineName,
  engineVersion,
  availableEngines,
  currentEngineName,
  changeScoringEngine,
} = useTrader()

// --- 4. LOCAL STATE ---
const logsContainer = ref<HTMLElement | null>(null)
const lastLogCount = ref(0)
const isInitialized = ref(false)
const activeTerminalTab = ref<'logs' | 'verified' | 'portfolio'>('logs')
const activeSettingsTab = ref<'general' | 'filters' | 'weights' | 'engine' | 'advanced'>('general')

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
  await fetchPortfolio()
  isInitialized.value = true
})

onUnmounted(() => {
  if (runningTimer) clearInterval(runningTimer)
})

// --- 8. CONTROLS ---
const toggleBot = () => {
  if (isAutoTrading.value) {
    StopBot()
    if (runningTimer) {
      clearInterval(runningTimer)
      runningTimer = null
    }
  } else {
    runningTime.value = 0
    startBot()
    runningTimer = setInterval(() => runningTime.value++, 1000)
  }
}

const emergencyStop = () => {
  StopBot()
  if (runningTimer) {
    clearInterval(runningTimer)
    runningTimer = null
  }
}

const manualSell = async (trade: any) => {
  await closePosition(trade, 'Manual Sell')
}

const manualBuy = (token: any) => {
  openBuyModal(token)
}

const removeToken = (address: string) => {
  removeFromVerified(address)
}

// --- 9. HELPERS ---
const getLogClass = (log: string) => {
  if (log.includes('✅') || log.includes('BUY:')) return 'text-green-400'
  if (log.includes('❌') || log.includes('error') || log.includes('failed')) return 'text-red-400'
  if (log.includes('⚠️') || log.includes('STOPPED')) return 'text-yellow-400'
  if (log.includes('📡')) return 'text-cyan-400'
  if (log.includes('💰') || log.includes('SELL:')) return 'text-orange-400'
  if (log.includes('🎯')) return 'text-pink-400'
  if (log.includes('🐣')) return 'text-yellow-300'
  if (log.includes('📈')) return 'text-blue-400'
  if (log.includes('🚀')) return 'text-purple-400'
  if (log.includes('⚡')) return 'text-cyan-300'
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

const getTokenTypeBadge = (tokenType: string) => {
  if (tokenType === 'newborn') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500'
  if (tokenType === 'established') return 'bg-blue-500/20 text-blue-400 border-blue-500'
  return 'bg-gray-500/20 text-gray-400 border-gray-500'
}

const getConfidenceBadge = (confidence: string | undefined) => {
  if (confidence === 'high') return 'bg-green-500/20 text-green-400 border-green-500'
  if (confidence === 'low') return 'bg-red-500/20 text-red-400 border-red-500'
  return 'bg-gray-500/20 text-gray-400 border-gray-500'
}

const formatHoldTime = (seconds: number | undefined) => {
  if (!seconds) return ''
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}
</script>

<template>
  <div class="min-h-screen bg-black text-green-500 font-mono selection:bg-green-900 selection:text-white flex flex-col">

    <!-- SETTINGS MODAL -->
    <Teleport to="body">
      <div v-if="showSettingsModal" class="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-gray-900 border border-green-600 w-full max-w-2xl rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
          <!-- Modal Header -->
          <div class="flex justify-between items-center p-4 border-b border-green-900">
            <div>
              <h2 class="text-lg font-bold text-white">⚙️ Bot Settings</h2>
              <p class="text-[10px] text-green-700">Engine: {{ engineName }} v{{ engineVersion }}</p>
            </div>
            <button @click="closeSettingsModal" class="text-gray-500 hover:text-white text-2xl leading-none">&times;</button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-green-900 overflow-x-auto">
            <button
              @click="activeSettingsTab = 'general'"
              class="flex-1 py-2 px-3 text-[10px] font-bold uppercase transition-all whitespace-nowrap"
              :class="activeSettingsTab === 'general' ? 'bg-green-900/30 text-green-400 border-b-2 border-green-500' : 'text-green-700 hover:text-green-500'"
            >General</button>
            <button
              @click="activeSettingsTab = 'filters'"
              class="flex-1 py-2 px-3 text-[10px] font-bold uppercase transition-all whitespace-nowrap"
              :class="activeSettingsTab === 'filters' ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-500' : 'text-green-700 hover:text-green-500'"
            >Filters</button>
            <button
              @click="activeSettingsTab = 'advanced'"
              class="flex-1 py-2 px-3 text-[10px] font-bold uppercase transition-all whitespace-nowrap"
              :class="activeSettingsTab === 'advanced' ? 'bg-pink-900/30 text-pink-400 border-b-2 border-pink-500' : 'text-green-700 hover:text-green-500'"
            >Memecoin</button>
            <button
              @click="activeSettingsTab = 'weights'"
              class="flex-1 py-2 px-3 text-[10px] font-bold uppercase transition-all whitespace-nowrap"
              :class="activeSettingsTab === 'weights' ? 'bg-purple-900/30 text-purple-400 border-b-2 border-purple-500' : 'text-green-700 hover:text-green-500'"
            >Scoring</button>
            <button
              @click="activeSettingsTab = 'engine'"
              class="flex-1 py-2 px-3 text-[10px] font-bold uppercase transition-all whitespace-nowrap"
              :class="activeSettingsTab === 'engine' ? 'bg-orange-900/30 text-orange-400 border-b-2 border-orange-500' : 'text-green-700 hover:text-green-500'"
            >Engine</button>
          </div>

          <!-- Modal Body -->
          <div class="p-4 overflow-y-auto flex-1">
            <!-- GENERAL TAB -->
            <div v-if="activeSettingsTab === 'general'" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <label class="flex flex-col">
                  <span class="text-xs text-green-700 uppercase mb-1">Buy Amount ($)</span>
                  <input type="number" v-model.number="botSettings.buyAmount" class="bg-black border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none">
                  <span class="text-[10px] text-green-900 mt-1">Amount per trade (may be reduced by engine)</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-green-700 uppercase mb-1">Max Positions</span>
                  <input type="number" v-model.number="botSettings.maxPositions" class="bg-black border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none">
                  <span class="text-[10px] text-green-900 mt-1">Max open trades</span>
                </label>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <label class="flex flex-col">
                  <span class="text-xs text-green-700 uppercase mb-1">Take Profit (%)</span>
                  <input type="number" step="0.1" v-model.number="botSettings.takeProfit" class="bg-black border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none">
                  <span class="text-[10px] text-green-900 mt-1">Auto-sell at this profit</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-green-700 uppercase mb-1">Stop Loss (%)</span>
                  <input type="number" step="0.1" v-model.number="botSettings.stopLoss" class="bg-black border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none">
                  <span class="text-[10px] text-green-900 mt-1">Auto-sell at this loss</span>
                </label>
              </div>
              <label class="flex flex-col">
                <span class="text-xs text-green-700 uppercase mb-1">Minimum Score to Buy</span>
                <input type="number" v-model.number="botSettings.minScore" class="bg-black border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none">
                <span class="text-[10px] text-green-900 mt-1">Only buy tokens scoring above this (0-100)</span>
              </label>
              
              <!-- Quick Stats -->
              <div class="bg-green-900/10 border border-green-900 rounded-lg p-3 mt-4">
                <div class="text-xs text-green-600 font-bold mb-2">Current Session Stats</div>
                <div class="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span class="text-green-800">Discovered:</span>
                    <span class="text-green-400 ml-1">{{ stats?.totalDiscovered || 0 }}</span>
                  </div>
                  <div>
                    <span class="text-green-800">Verified:</span>
                    <span class="text-green-400 ml-1">{{ stats?.totalVerified || 0 }}</span>
                  </div>
                  <div>
                    <span class="text-green-800">Rejected:</span>
                    <span class="text-red-400 ml-1">{{ stats?.totalRejected || 0 }}</span>
                  </div>
                  <div>
                    <span class="text-green-800">BirdEye Calls:</span>
                    <span class="text-cyan-400 ml-1">{{ stats?.birdeyeCallsUsed || 0 }}</span>
                  </div>
                  <div>
                    <span class="text-green-800">Queue:</span>
                    <span class="text-yellow-400 ml-1">{{ queueStats?.queueLength || 0 }}</span>
                  </div>
                  <div>
                    <span class="text-green-800">Cached:</span>
                    <span class="text-purple-400 ml-1">{{ queueStats?.cacheSize || 0 }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- TWO-TIER FILTERS TAB -->
            <div v-if="activeSettingsTab === 'filters'" class="space-y-6">
              <!-- NEWBORN SETTINGS -->
              <div class="border border-yellow-800 rounded-lg p-4 bg-yellow-900/10">
                <h3 class="text-sm font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  🐣 Newborn Tokens
                  <span class="text-[10px] font-normal text-yellow-600">High risk, high reward</span>
                </h3>
                <div class="grid grid-cols-2 gap-3">
                  <label class="flex flex-col">
                    <span class="text-[10px] text-yellow-600 uppercase mb-1">Max Age (minutes)</span>
                    <input type="number" v-model.number="botSettings.newborn.maxAgeMinutes" class="bg-black border border-yellow-800 rounded px-2 py-1.5 text-sm text-yellow-400 focus:border-yellow-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-yellow-600 uppercase mb-1">Min Txns (5m)</span>
                    <input type="number" v-model.number="botSettings.newborn.minTxns5m" class="bg-black border border-yellow-800 rounded px-2 py-1.5 text-sm text-yellow-400 focus:border-yellow-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-yellow-600 uppercase mb-1">Min Liquidity ($)</span>
                    <input type="number" v-model.number="botSettings.newborn.minLiquidity" class="bg-black border border-yellow-800 rounded px-2 py-1.5 text-sm text-yellow-400 focus:border-yellow-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-yellow-600 uppercase mb-1">Max Liquidity ($)</span>
                    <input type="number" v-model.number="botSettings.newborn.maxLiquidity" class="bg-black border border-yellow-800 rounded px-2 py-1.5 text-sm text-yellow-400 focus:border-yellow-500 outline-none">
                  </label>
                </div>
                <p class="text-[9px] text-yellow-700 mt-2">⚠️ Engine may apply stricter filters (e.g., 5min danger zone)</p>
              </div>

              <!-- ESTABLISHED SETTINGS -->
              <div class="border border-blue-800 rounded-lg p-4 bg-blue-900/10">
                <h3 class="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                  📈 Established Tokens
                  <span class="text-[10px] font-normal text-blue-600">Lower risk, consistent activity</span>
                </h3>
                <div class="grid grid-cols-2 gap-3">
                  <label class="flex flex-col">
                    <span class="text-[10px] text-blue-600 uppercase mb-1">Min Liquidity ($)</span>
                    <input type="number" v-model.number="botSettings.established.minLiquidity" class="bg-black border border-blue-800 rounded px-2 py-1.5 text-sm text-blue-400 focus:border-blue-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-blue-600 uppercase mb-1">Max Liquidity ($)</span>
                    <input type="number" v-model.number="botSettings.established.maxLiquidity" class="bg-black border border-blue-800 rounded px-2 py-1.5 text-sm text-blue-400 focus:border-blue-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-blue-600 uppercase mb-1">Min Txns/Hour</span>
                    <input type="number" v-model.number="botSettings.established.minTxns1h" class="bg-black border border-blue-800 rounded px-2 py-1.5 text-sm text-blue-400 focus:border-blue-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-blue-600 uppercase mb-1">Min Volume/Hour ($)</span>
                    <input type="number" v-model.number="botSettings.established.minVolume1h" class="bg-black border border-blue-800 rounded px-2 py-1.5 text-sm text-blue-400 focus:border-blue-500 outline-none">
                  </label>
                </div>
              </div>

              <!-- THRESHOLDS -->
              <div class="border border-green-800 rounded-lg p-4 bg-green-900/10">
                <h3 class="text-sm font-bold text-green-400 mb-3">Momentum Thresholds</h3>
                <div class="grid grid-cols-3 gap-3">
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Strong 5m (%)</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.strongMomentum5m" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Good 5m (%)</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.goodMomentum5m" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Min 5m (%)</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.minMomentum5m" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Strong Buy Ratio</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.strongBuyRatio" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Good Buy Ratio</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.goodBuyRatio" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-green-600 uppercase mb-1">Volume Spike X</span>
                    <input type="number" step="0.1" v-model.number="botSettings.thresholds.volumeSpikeMultiplier" class="bg-black border border-green-800 rounded px-2 py-1.5 text-sm text-green-400 focus:border-green-500 outline-none">
                  </label>
                </div>
              </div>
            </div>

            <!-- ADVANCED MEMECOIN TAB -->
            <div v-if="activeSettingsTab === 'advanced'" class="space-y-6">
              <div class="bg-pink-900/20 border border-pink-800 rounded-lg p-4">
                <h3 class="text-sm font-bold text-pink-400 mb-2">🎯 Memecoin Sniper Settings</h3>
                <p class="text-[10px] text-pink-600 mb-4">Settings optimized for fast memecoin scalping with 1-minute data.</p>
                
                <div class="grid grid-cols-2 gap-4">
                  <label class="flex flex-col">
                    <span class="text-[10px] text-pink-600 uppercase mb-1">Max Hold Time (seconds)</span>
                    <input type="number" v-model.number="botSettings.maxHoldTimeSeconds" class="bg-black border border-pink-800 rounded px-2 py-1.5 text-sm text-pink-400 focus:border-pink-500 outline-none">
                    <span class="text-[9px] text-pink-900 mt-1">Auto-exit after this time (0 = disabled)</span>
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-pink-600 uppercase mb-1">Use 1m Data</span>
                    <select v-model="botSettings.useShortTimeframes" class="bg-black border border-pink-800 rounded px-2 py-1.5 text-sm text-pink-400 focus:border-pink-500 outline-none">
                      <option :value="true">Enabled (BirdEye)</option>
                      <option :value="false">Disabled</option>
                    </select>
                    <span class="text-[9px] text-pink-900 mt-1">Requires BirdEye API key</span>
                  </label>
                </div>
              </div>

              <!-- Scaled Take Profit -->
              <div class="border border-purple-800 rounded-lg p-4 bg-purple-900/10">
                <h3 class="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                  📊 Scaled Take Profit
                  <span class="text-[10px] font-normal text-purple-600">(Coming Soon)</span>
                </h3>
                <p class="text-[10px] text-purple-700 mb-3">Exit positions in stages to lock in profits while letting winners run.</p>
                <div class="grid grid-cols-2 gap-4 opacity-50">
                  <label class="flex flex-col">
                    <span class="text-[10px] text-purple-600 uppercase mb-1">TP1 Level (%)</span>
                    <input type="number" step="0.1" :value="botSettings.scaledTakeProfit?.tp1Percent || 0.8" disabled class="bg-black border border-purple-800 rounded px-2 py-1.5 text-sm text-purple-400 outline-none cursor-not-allowed">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-purple-600 uppercase mb-1">TP1 Size (%)</span>
                    <input type="number" :value="botSettings.scaledTakeProfit?.tp1Size || 50" disabled class="bg-black border border-purple-800 rounded px-2 py-1.5 text-sm text-purple-400 outline-none cursor-not-allowed">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-purple-600 uppercase mb-1">TP2 Level (%)</span>
                    <input type="number" step="0.1" :value="botSettings.scaledTakeProfit?.tp2Percent || 1.8" disabled class="bg-black border border-purple-800 rounded px-2 py-1.5 text-sm text-purple-400 outline-none cursor-not-allowed">
                  </label>
                  <label class="flex flex-col">
                    <span class="text-[10px] text-purple-600 uppercase mb-1">TP2 Size (%)</span>
                    <input type="number" :value="botSettings.scaledTakeProfit?.tp2Size || 50" disabled class="bg-black border border-purple-800 rounded px-2 py-1.5 text-sm text-purple-400 outline-none cursor-not-allowed">
                  </label>
                </div>
              </div>

              <!-- Exit Triggers Info -->
              <div class="border border-cyan-800 rounded-lg p-4 bg-cyan-900/10">
                <h3 class="text-sm font-bold text-cyan-400 mb-3">⚡ Active Exit Triggers</h3>
                <div class="space-y-2 text-[10px]">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span class="text-cyan-300">Take Profit:</span>
                    <span class="text-white">+{{ botSettings.takeProfit }}%</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span class="text-cyan-300">Stop Loss:</span>
                    <span class="text-white">-{{ botSettings.stopLoss }}%</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-yellow-500 rounded-full"></span>
                    <span class="text-cyan-300">Max Hold:</span>
                    <span class="text-white">{{ botSettings.maxHoldTimeSeconds || 'Disabled' }}{{ botSettings.maxHoldTimeSeconds ? 's' : '' }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-orange-500 rounded-full"></span>
                    <span class="text-cyan-300">1m Dump Exit:</span>
                    <span class="text-white">&lt; -1% (if not profitable)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-orange-500 rounded-full"></span>
                    <span class="text-cyan-300">5m Momentum Exit:</span>
                    <span class="text-white">&lt; -2% (if in loss)</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 bg-pink-500 rounded-full"></span>
                    <span class="text-cyan-300">1m Sell Pressure:</span>
                    <span class="text-white">Sells &gt; 1.5x Buys</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- WEIGHTS TAB -->
            <div v-if="activeSettingsTab === 'weights'" class="space-y-4">
              <p class="text-xs text-purple-600 mb-4">These weights are used by V1/V2 engines. Memecoin Sniper uses its own internal weights.</p>
              <div class="grid grid-cols-2 gap-4">
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">5m Price Change</span>
                  <input type="number" v-model.number="botSettings.weights.priceChange5m" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Primary signal (recommended: 40)</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">5m Buy Pressure</span>
                  <input type="number" v-model.number="botSettings.weights.buyPressure5m" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Immediate buying activity</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">1h Buy Pressure</span>
                  <input type="number" v-model.number="botSettings.weights.buyPressure1h" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Sustained trend confirmation</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">Volume Spike</span>
                  <input type="number" v-model.number="botSettings.weights.volumeSpike" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Unusual volume activity</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">Liquidity Health</span>
                  <input type="number" v-model.number="botSettings.weights.liquidityHealth" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Pool safety check</span>
                </label>
                <label class="flex flex-col">
                  <span class="text-xs text-purple-600 uppercase mb-1">Freshness Bonus</span>
                  <input type="number" v-model.number="botSettings.weights.freshnessBonus" class="bg-black border border-purple-800 rounded-lg px-3 py-2 text-purple-400 focus:border-purple-500 outline-none">
                  <span class="text-[10px] text-purple-900 mt-1">Bonus for newborn tokens</span>
                </label>
              </div>
              <div class="bg-purple-900/20 border border-purple-800 rounded-lg p-3 mt-4">
                <div class="text-xs text-purple-400">
                  Total Weight: <span class="font-bold">{{ Object.values(botSettings.weights).reduce((a, b) => a + b, 0) }}</span>
                  <span class="text-purple-700 ml-2">(Recommended: 100)</span>
                </div>
              </div>
            </div>

            <!-- ENGINE TAB -->
            <div v-if="activeSettingsTab === 'engine'" class="space-y-4">
              <div class="bg-orange-900/20 border border-orange-800 rounded-lg p-4">
                <h3 class="text-sm font-bold text-orange-400 mb-2">Current Engine</h3>
                <p class="text-lg text-white">{{ engineName }}</p>
                <p class="text-xs text-orange-600">Version: {{ engineVersion }}</p>
              </div>

              <div>
                <h3 class="text-sm font-bold text-orange-400 mb-3">Available Engines</h3>
                <div class="space-y-2">
                  <div
                    v-for="engine in availableEngines"
                    :key="engine.id"
                    @click="changeScoringEngine(engine.id)"
                    class="p-3 border rounded-lg cursor-pointer transition-all"
                    :class="currentEngineName === engine.id
                      ? 'border-orange-500 bg-orange-900/30'
                      : 'border-gray-700 hover:border-orange-700 bg-gray-900/50'"
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="font-bold text-white">{{ engine.name }}</p>
                        <p class="text-[10px] text-gray-500">{{ engine.description }}</p>
                      </div>
                      <div
                        v-if="currentEngineName === engine.id"
                        class="w-3 h-3 bg-orange-500 rounded-full"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

             
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="p-4 border-t border-green-900 flex justify-between items-center">
            <div class="text-[10px] text-gray-600">
              Engine: {{ engineName }} v{{ engineVersion }} | Data: {{ stats?.dataQuality || 'unknown' }}
            </div>
            <button @click="closeSettingsModal" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-all">Close</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- BUY MODAL -->
    <div v-if="showBuyModal && selectedToken" class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-gray-900 border border-green-600 w-full max-w-sm rounded-xl p-5">
        <div class="flex justify-between items-start mb-4">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-white">Buy {{ selectedToken.symbol }}</h3>
              <span
                v-if="selectedToken.tokenType"
                class="text-[9px] px-1.5 py-0.5 rounded border"
                :class="getTokenTypeBadge(selectedToken.tokenType)"
              >
                {{ selectedToken.tokenType === 'newborn' ? '🐣 NEW' : '📈 ACTIVE' }}
              </span>
            </div>
            <p class="text-xs text-green-600">${{ formatPrice(selectedToken.price) }} • Score: {{ selectedToken.score || '?' }}</p>
            <p v-if="selectedToken.maxSafePosition" class="text-[10px] text-yellow-600">
              Max safe position: ${{ selectedToken.maxSafePosition.toFixed(0) }}
            </p>
          </div>
          <button @click="showBuyModal = false" class="text-gray-500 hover:text-white text-xl">&times;</button>
        </div>

        <!-- Token Stats -->
        <div class="grid grid-cols-2 gap-2 mb-4 text-[10px]">
          <div class="bg-black/50 rounded p-2">
            <div class="text-gray-500">1m Change</div>
            <div :class="(selectedToken.priceChange1m || 0) >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
              {{ (selectedToken.priceChange1m || 0) >= 0 ? '+' : '' }}{{ (selectedToken.priceChange1m || 0).toFixed(2) }}%
            </div>
          </div>
          <div class="bg-black/50 rounded p-2">
            <div class="text-gray-500">5m Change</div>
            <div :class="(selectedToken.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'" class="font-bold">
              {{ (selectedToken.priceChange5m || 0) >= 0 ? '+' : '' }}{{ (selectedToken.priceChange5m || 0).toFixed(2) }}%
            </div>
          </div>
          <div class="bg-black/50 rounded p-2">
            <div class="text-gray-500">1m B/S</div>
            <div class="text-white font-bold">
              {{ selectedToken.txns1m?.buys || 0 }}/{{ selectedToken.txns1m?.sells || 0 }}
            </div>
          </div>
          <div class="bg-black/50 rounded p-2">
            <div class="text-gray-500">Liquidity</div>
            <div class="text-white font-bold">{{ formatVal(selectedToken.liquidity) }}</div>
          </div>
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
            <button 
              v-if="selectedToken.maxSafePosition"
              @click="buyAmount = Math.min(selectedToken.maxSafePosition, 50)" 
              class="flex-1 py-1.5 bg-yellow-900/30 hover:bg-yellow-900/50 border border-yellow-800 rounded text-xs text-yellow-400"
            >Safe</button>
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

    <!-- HEADER -->
    <header class="bg-black/90 border-b border-green-900 px-4 py-2.5 sticky top-0 z-40 backdrop-blur-sm">
      <div class="max-w-7xl mx-auto flex justify-between items-center">

        <!-- Left -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class="w-2 h-2 rounded-full"
              :class="isAutoTrading ? 'bg-green-500 animate-pulse' : 'bg-red-500'"
            ></div>
            <h1 class="text-base font-bold">SCALP<span class="animate-pulse">_</span>BOT</h1>
          </div>
          <span v-if="isAutoTrading" class="text-[9px] px-1.5 py-0.5 rounded bg-green-900/50 border border-green-700 text-green-400">
            {{ formattedRunningTime }}
          </span>
          <span v-if="isAutoTrading && queueStats" class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/50 border border-cyan-700 text-cyan-400">
            Q:{{ queueStats.queueLength }}
          </span>
        </div>

        <!-- Center Stats -->
<div class="hidden md:flex items-center gap-4 text-[10px]">
  <div class="text-center">
    <div class="text-green-700">REALIZED</div>
    <div class="font-bold" :class="getPnLClass(historyStats?.realizedPnL || 0)">
      ${{ (historyStats?.realizedPnL || 0).toFixed(2) }}
    </div>
  </div>
  <div class="text-center">
    <div class="text-green-700">WIN%</div>
    <div class="font-bold text-white">{{ (historyStats?.winRate || 0).toFixed(0) }}%</div>
  </div>
  <div class="text-center">
    <div class="text-green-700">TRADES</div>
    <div class="font-bold text-white">{{ historyStats?.totalTrades || 0 }}</div>
  </div>
  <div class="text-center border-l border-green-900 pl-4">
    <div class="text-yellow-600">🐣 NEWBORN</div>
    <div class="font-bold text-yellow-400">{{ stats?.newbornFound || 0 }}</div>
  </div>
  <div class="text-center">
    <div class="text-blue-600">📈 ACTIVE</div>
    <div class="font-bold text-blue-400">{{ stats?.establishedFound || 0 }}</div>
  </div>
  <div class="text-center border-l border-green-900 pl-4">
    <div class="text-green-700">POSITIONS</div>
    <div class="font-bold text-white">{{ activeTrades?.length || 0 }}/{{ botSettings.maxPositions }}</div>
  </div>
  <!-- Stream Status Indicator -->
  <div class="text-center border-l border-green-900 pl-4">
    <div class="text-cyan-600">🌊 STREAM</div>
    <div class="font-bold" :class="streamStatus?.connected ? 'text-green-400' : 'text-yellow-400'">
      {{ streamStatus?.connected ? streamStatus?.tokensTracked || 0 : 'OFFLINE' }}
    </div>
  </div>
</div>

        <!-- Right Controls -->
        <div class="flex items-center gap-2">
          <button
            @click="openSettingsModal"
            class="px-3 py-1.5 bg-gray-800 border border-gray-700 hover:border-green-600 hover:bg-gray-700 rounded text-[10px] font-bold uppercase text-gray-400 hover:text-green-400 transition-all"
          >⚙️</button>

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

      <!-- MAIN GRID -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">

        <!-- LEFT: TERMINAL -->
        <div class="lg:col-span-2 flex flex-col bg-black border border-green-900 rounded-lg overflow-hidden" style="min-height: 500px;">

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
            >History ({{ tradeHistory?.length || 0 }})</button>
          </div>

          <!-- LOGS TAB -->
          <div
            v-show="activeTerminalTab === 'logs'"
            ref="logsContainer"
            class="flex-1 p-2 overflow-y-auto text-[10px]"
            style="max-height: 420px;"
          >
            <div v-if="!botLogs?.length" class="text-green-900 italic py-6 text-center">
              Ready. Click START to begin hunting...
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
            style="max-height: 420px;"
          >
            <div v-if="!verifiedTokens?.length" class="text-green-900 italic py-6 text-center text-xs">
              No tokens being watched...
            </div>
            <div v-else class="space-y-1.5">
              <div
                v-for="token in verifiedTokens"
                :key="token.address"
                class="bg-gray-900/50 border rounded p-2"
                :class="token.signal === 'BUY' ? 'border-green-600' : 'border-gray-800'"
              >
                <div class="flex items-center gap-2">
                  <!-- Logo -->
                  <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0 text-[8px]">
                    <img v-if="token.logoURI" :src="token.logoURI" class="w-full h-full object-cover" @error="(e: any) => e.target.style.display='none'" />
                    <span v-else>{{ token.symbol?.slice(0,2) }}</span>
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-xs text-white truncate">{{ token.symbol }}</span>
                      <a :href="`https://birdeye.so/token/${token.address}?chain=solana`" target="_blank" class="text-green-700 hover:text-green-400 text-[9px]">↗</a>
                      <span
                        class="text-[8px] px-1 py-0.5 rounded font-bold"
                        :class="getSignalBadge(token.signal)"
                      >{{ token.signal }}</span>
                      <span
                        class="text-[8px] px-1 py-0.5 rounded border"
                        :class="getTokenTypeBadge(token.tokenType)"
                      >
                        {{ token.tokenType === 'newborn' ? `🐣 ${token.ageMinutes}m` : '📈' }}
                      </span>
                      <span
                        v-if="token.confidence"
                        class="text-[8px] px-1 py-0.5 rounded border"
                        :class="getConfidenceBadge(token.confidence)"
                      >
                        {{ token.confidence }}
                      </span>
                    </div>
                    <div class="text-[9px] text-gray-500 flex gap-2 flex-wrap">
                      <span>{{ formatVal(token.liquidity) }}</span>
                      <span v-if="token.txns1m" class="text-cyan-600">1m: {{ token.txns1m.buys + token.txns1m.sells }}tx</span>
                      <span>5m: {{ (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0) }}tx</span>
                    </div>
                  </div>

                  <!-- Momentum (1m + 5m) -->
                  <div class="text-right text-[9px] min-w-[70px]">
                    <div v-if="token.priceChange1m !== undefined" :class="token.priceChange1m >= 0 ? 'text-cyan-400' : 'text-red-400'">
                      1m: {{ token.priceChange1m >= 0 ? '+' : '' }}{{ token.priceChange1m.toFixed(1) }}%
                    </div>
                    <div :class="(token.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'">
                      5m: {{ (token.priceChange5m || 0) >= 0 ? '+' : '' }}{{ (token.priceChange5m || 0).toFixed(1) }}%
                    </div>
                    <div class="text-gray-600">
                      {{ token.txns1m ? `${token.txns1m.buys}B/${token.txns1m.sells}S` : `${token.txns5m?.buys || 0}/${token.txns5m?.sells || 0}` }}
                    </div>
                  </div>

                  <!-- Score -->
                  <div
                    class="px-2 py-1 rounded border text-xs font-bold text-center min-w-[40px]"
                    :class="getScoreColor(token.score || 0)"
                  >
                    {{ token.score || 0 }}
                  </div>

                  <!-- Actions -->
                  <div class="flex gap-1">
                    <button
                      @click="manualBuy(token)"
                      class="px-2 py-1 bg-green-900/30 hover:bg-green-600 border border-green-700 rounded text-[9px] text-green-400 hover:text-black transition-all"
                    >Buy</button>
                    <button
                      @click="removeToken(token.address)"
                      class="px-2 py-1 bg-red-900/30 hover:bg-red-600 border border-red-800 rounded text-[9px] text-red-400 hover:text-white transition-all"
                      title="Remove from watchlist"
                    >✕</button>
                  </div>
                </div>
                
                <!-- Score Reasons -->
                <div v-if="token.scoreReasons?.length" class="mt-1.5 flex flex-wrap gap-1">
                  <span
                    v-for="(reason, idx) in token.scoreReasons.slice(0, 5)"
                    :key="idx"
                    class="text-[8px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
                  >{{ reason }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- PORTFOLIO/HISTORY TAB -->
          <div
            v-show="activeTerminalTab === 'portfolio'"
            class="flex-1 p-2 overflow-y-auto"
            style="max-height: 420px;"
          >
            <!-- Summary Stats -->
            <div class="flex gap-3 mb-2 pb-2 border-b border-green-900/30 flex-wrap">
              <div class="bg-green-900/10 px-2 py-1 rounded border border-green-900/50 flex items-center gap-2">
                <span class="text-[9px] text-green-700 uppercase">Realized</span>
                <span class="font-bold text-xs" :class="(historyStats?.realizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'">${{ (historyStats?.realizedPnL || 0).toFixed(2) }}</span>
              </div>
              <div class="bg-green-900/10 px-2 py-1 rounded border border-green-900/50 flex items-center gap-2">
                <span class="text-[9px] text-green-700 uppercase">Avg ROI</span>
                <span class="font-bold text-xs" :class="(historyStats?.avgReturn || 0) >= 0 ? 'text-green-400' : 'text-red-400'">{{ (historyStats?.avgReturn || 0).toFixed(1) }}%</span>
              </div>
              <div class="bg-green-900/10 px-2 py-1 rounded border border-green-900/50 flex items-center gap-2">
                <span class="text-[9px] text-green-700 uppercase">Win Rate</span>
                <span class="font-bold text-xs text-white">{{ (historyStats?.winRate || 0).toFixed(0) }}%</span>
              </div>
              <div class="bg-green-900/10 px-2 py-1 rounded border border-green-900/50 flex items-center gap-2">
                <span class="text-[9px] text-green-700 uppercase">Avg Hold</span>
<span class="font-bold text-xs text-cyan-400">{{ formatHoldTime(historyStats?.avgHoldTime) || '-' }}</span>
</div>
</div>
        <div v-if="!tradeHistory?.length" class="text-green-900 italic py-6 text-center text-xs">
          No closed trades yet...
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
                <td class="p-2 text-right font-mono" :class="((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100) >= 0 ? 'text-green-400' : 'text-red-400'">
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
        <span class="text-green-600 truncate max-w-[50%]">{{ currentChecking || 'Idle' }}</span>
        <div class="flex items-center gap-3">
          <span class="text-green-800">Disc: {{ discoveryQueue?.length || 0 }}</span>
          <span v-if="queueStats" class="text-cyan-700">API: {{ queueStats.queueLength }}</span>
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
        <button @click="refreshPortfolioPrices" class="text-[8px] text-green-700 hover:text-green-400">↻ Refresh</button>
      </div>

      <div class="flex-1 overflow-y-auto p-2" style="max-height: 500px;">
        <div v-if="!activeTrades?.length" class="text-center py-8 text-green-900 text-xs">
          <div class="text-2xl mb-2">📭</div>
          No open positions
          <div class="text-[9px] mt-1 text-green-800">
            {{ isAutoTrading ? 'Hunting for opportunities...' : 'Start bot to trade' }}
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
                  <a :href="`https://birdeye.so/token/${trade.address}?chain=solana`" target="_blank" class="text-green-700 hover:text-green-400 text-[8px]">↗</a>
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

            <!-- 1m + 5m indicators -->
            <div class="text-[9px] mb-1.5 flex items-center gap-3 flex-wrap">
              <div v-if="trade.priceChange1m !== undefined" class="flex items-center gap-1">
                <span class="text-cyan-700">1m:</span>
                <span :class="trade.priceChange1m >= 0 ? 'text-cyan-400' : 'text-red-400'">
                  {{ trade.priceChange1m >= 0 ? '+' : '' }}{{ trade.priceChange1m.toFixed(1) }}%
                </span>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-green-700">5m:</span>
                <span :class="(trade.priceChange5m || 0) >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ (trade.priceChange5m || 0) >= 0 ? '+' : '' }}{{ (trade.priceChange5m || 0).toFixed(1) }}%
                </span>
              </div>
              <span v-if="trade.txns1m" class="text-gray-600">
                ({{ trade.txns1m.buys }}B/{{ trade.txns1m.sells }}S)
              </span>
              <span v-if="trade.holdTimeSeconds" class="text-yellow-600 ml-auto">
                ⏱️ {{ formatHoldTime(trade.holdTimeSeconds) }}
              </span>
            </div>

            <!-- Progress -->
            <div class="mb-1.5">
              <div class="flex justify-between text-[7px] text-green-700 mb-0.5">
                <span>-{{ botSettings.stopLoss }}% SL</span>
                <span>+{{ botSettings.takeProfit }}% TP</span>
              </div>
              <div class="h-1.5 bg-green-900/30 rounded-full relative overflow-hidden">
                <div class="absolute left-1/2 top-0 bottom-0 w-px bg-green-700"></div>
                <div
                  class="h-full absolute transition-all duration-300"
                  :class="(trade.pnlPercent || 0) >= 0 ? 'bg-green-500 left-1/2' : 'bg-red-500 right-1/2'"
                  :style="{ width: Math.min(50, Math.abs(trade.pnlPercent || 0) / Math.max(botSettings.takeProfit, botSettings.stopLoss) * 50) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Max Hold Warning -->
            <div 
              v-if="botSettings.maxHoldTimeSeconds && trade.holdTimeSeconds && trade.holdTimeSeconds > botSettings.maxHoldTimeSeconds * 0.8"
              class="text-[8px] text-yellow-500 mb-1"
            >
              ⚠️ Approaching max hold time
            </div>

            <button
              @click="manualSell(trade)"
              class="w-full py-1.5 text-[9px] font-bold uppercase bg-red-900/30 hover:bg-red-600 border border-red-900 rounded text-red-400 hover:text-white transition-all"
            >Sell Now</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>

<!-- FOOTER -->
<footer class="border-t border-green-900 p-2 bg-black/50">
  <div class="max-w-7xl mx-auto flex justify-between items-center text-[9px]">
    <div class="text-green-800">
      🐣 Newborn: &lt;{{ botSettings.newborn.maxAgeMinutes }}m • ${{ formatVal(botSettings.newborn.minLiquidity) }}-{{ formatVal(botSettings.newborn.maxLiquidity) }}
    </div>
    <div class="text-green-900">
      ${{ botSettings.buyAmount }} • {{ botSettings.takeProfit }}%TP • {{ botSettings.stopLoss }}%SL • {{ botSettings.minScore }}+score • {{ engineName }} • {{ botSettings.maxHoldTimeSeconds || '∞' }}s max
    </div>
    <div class="text-green-800">
      📈 Est: {{ botSettings.established.minTxns1h }}+ txns/h • BirdEye: {{ stats?.birdeyeCallsUsed || 0 }} calls
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
</style>