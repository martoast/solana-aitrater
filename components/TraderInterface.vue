<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useWallet, WalletMultiButton } from 'solana-wallets-vue'

// --- CONFIG ---
const config = useRuntimeConfig()
const network = config.public.solanaNetwork as string
const rpcUrl = config.public.solanaRpcHost || clusterApiUrl(network as any)
const connection = new Connection(rpcUrl, 'confirmed')

// --- STATE ---
const { publicKey, connected } = useWallet()
const balance = ref<number | null>(null)
const activeTab = ref<'hunter' | 'positions' | 'wallet'>('hunter')

// Hunter Mode State
const hunterMode = ref<'trending' | 'fresh'>('fresh') 

// Data Containers
const verifiedTokens = ref<any[]>([]) 
const rejectedTokens = ref<any[]>([]) 
const processingQueue = ref<any[]>([]) 
const activeTrades = ref<any[]>([])
const tradeHistory = ref<any[]>([])

// Cache
const checkedCache = ref(new Set<string>())

// Sieve State
const isSieveRunning = ref(false) 
const currentChecking = ref<string>('') 

// Filters
const minLiquidity = ref(5000) 

// UI States
const loadingHunter = ref(false)
const loadingPortfolio = ref(false)
const isRefreshing = ref(false)
const airdropping = ref(false)
const processingId = ref<string | null>(null)
const aiAnalysis = ref<any>(null) 
const manageAdvice = ref<any>(null)

// Timers
const portfolioTimer = ref<any>(null)

// --- BUY MODAL STATE ---
const showBuyModal = ref(false)
const buyAmount = ref(10) 
const selectedToken = ref<any>(null)
const isBuying = ref(false)

// --- COMPUTED METRICS ---
const totalPortfolioValue = computed(() => {
  let total = 0
  activeTrades.value.forEach(t => {
    const currentVal = t.currentPrice 
      ? (t.amount / t.entryPrice) * t.currentPrice 
      : t.amount
    total += currentVal
  })
  return total
})

const totalPnL = computed(() => {
  const invested = activeTrades.value.reduce((acc, t) => acc + t.amount, 0)
  return totalPortfolioValue.value - invested
})

// FIXED: Safe History Stats Calculation
const historyStats = computed(() => {
  const closed = tradeHistory.value || []
  if (closed.length === 0) return { realizedPnL: 0, winRate: 0, avgReturn: 0, totalTrades: 0 }

  const realizedPnL = closed.reduce((acc, t) => acc + (t.pnl || 0), 0)
  const wins = closed.filter(t => (t.pnl || 0) > 0).length
  const winRate = (wins / closed.length) * 100
  
  const totalRoi = closed.reduce((acc, t) => {
    if (!t.exitPrice || !t.entryPrice) return acc
    const roi = ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100
    return acc + roi
  }, 0)
  
  const avgReturn = totalRoi / closed.length

  return { realizedPnL, winRate, avgReturn, totalTrades: closed.length }
})

// --- HELPERS ---
const formatVal = (num: number) => {
  if (!num) return '$0'
  if (num > 1000000) return `$${(num/1000000).toFixed(1)}M`
  if (num > 1000) return `$${(num/1000).toFixed(1)}K`
  return `$${Math.floor(num).toLocaleString()}`
}

const getExplorerLink = (address: string) => `https://birdeye.so/token/${address}?chain=solana`

const formatTimeAgo = (isoDate: string) => {
  if (!isoDate) return ''
  const dateStr = isoDate.endsWith('Z') ? isoDate : `${isoDate}Z`
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins/60)}h ago`
}

// --- REAL-TIME PORTFOLIO LOGIC ---
const startPortfolioMonitor = () => {
  fetchPortfolio()
  portfolioTimer.value = setInterval(refreshPortfolioPrices, 3000)
}

const stopPortfolioMonitor = () => {
  if (portfolioTimer.value) clearInterval(portfolioTimer.value)
}

const fetchPortfolio = async () => {
  loadingPortfolio.value = true
  try {
    const res = await fetch('/api/portfolio')
    const json = await res.json()
    
    activeTrades.value = json.trades.map((t: any) => {
      const existing = activeTrades.value.find(old => old.id === t.id)
      return {
        ...t,
        currentPrice: existing?.currentPrice || null, 
        pnl: existing?.pnl || 0,
        pnlPercent: existing?.pnlPercent || 0,
        currentValue: existing?.currentValue || t.amount
      }
    })

    tradeHistory.value = json.history || []
    await refreshPortfolioPrices()
  } catch (e) { console.error(e) }
  finally { loadingPortfolio.value = false }
}

const refreshPortfolioPrices = async () => {
  if (activeTrades.value.length === 0) return
  isRefreshing.value = true

  try {
    const addresses = activeTrades.value.map(t => t.address).filter(a => a)
    if (addresses.length === 0) return

    const res = await fetch('/api/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses })
    })
    const json = await res.json()

    if (json.success && json.prices) {
      activeTrades.value.forEach(trade => {
        const price = json.prices[trade.address]
        if (price) {
          trade.currentPrice = price
          const tokenCount = trade.amount / trade.entryPrice
          const currentValue = tokenCount * price
          trade.currentValue = currentValue
          trade.pnl = currentValue - trade.amount
          trade.pnlPercent = ((price - trade.entryPrice) / trade.entryPrice) * 100
        }
      })
    }
  } catch (e) { console.error("Price update failed", e) }
  finally { isRefreshing.value = false }
}

// --- THE SIEVE ---
const fetchAndQueue = async () => {
  loadingHunter.value = true
  verifiedTokens.value = []
  rejectedTokens.value = []
  checkedCache.value.clear()
  try {
    const res = await fetch(`/api/hunter?type=${hunterMode.value}`)
    const json = await res.json()
    if (json.success) {
      const newItems = json.data.items.filter((t: any) => !checkedCache.value.has(t.address))
      processingQueue.value.push(...newItems)
      newItems.forEach((t: any) => checkedCache.value.add(t.address))
    }
  } catch (e) { console.error(e) } 
  finally { loadingHunter.value = false }
}

const toggleSieve = () => {
  if (isSieveRunning.value) {
    isSieveRunning.value = false
    currentChecking.value = 'Paused'
  } else {
    isSieveRunning.value = true
    processNextInQueue()
  }
}

const processNextInQueue = async () => {
  if (!isSieveRunning.value) return
  if (processingQueue.value.length === 0) {
    currentChecking.value = 'Queue Empty'
    isSieveRunning.value = false 
    return
  }
  
  const token = processingQueue.value.shift()
  currentChecking.value = `Checking ${token.symbol}...`
  
  try {
    const res = await fetch('/api/check-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: token.address })
    })
    const data = await res.json()
    
    if (data.success && data.overview) {
       token.liquidity = parseFloat(data.overview.liquidity || token.liquidity || 0)
       token.v24hUSD = parseFloat(data.overview.volume?.h24 || 0)
       token.price24hChangePercent = parseFloat(data.overview.priceChange?.h24 || 0)
       token.price = parseFloat(data.overview.price || token.price || 0)
       
       token.socials = {
         website: token.prefilledSocials?.website || data.socials?.website,
         twitter: token.prefilledSocials?.twitter || data.socials?.twitter,
         telegram: token.prefilledSocials?.telegram || data.socials?.telegram,
       }
       token.logoURI = data.logoURI || token.logoURI
    }

    const hasSocials = token.socials?.website || token.socials?.twitter || token.socials?.telegram
    const hasLiquidity = token.liquidity >= minLiquidity.value

    if (hasSocials && hasLiquidity) {
       verifiedTokens.value.unshift(token) 
    } else {
       if (!hasSocials) token.rejectReason = 'No Socials'
       else if (!hasLiquidity) token.rejectReason = `Low Liq ($${formatVal(token.liquidity)})`
       else token.rejectReason = 'Filter Reject'
       rejectedTokens.value.unshift(token) 
    }

  } catch (e) {
    token.rejectReason = 'API Error'
    rejectedTokens.value.unshift(token)
  } finally {
    setTimeout(() => { processNextInQueue() }, 350)
  }
}

// --- ACTIONS: AI & TRADING ---
const analyzeToken = async (token: any) => {
  processingId.value = token.address
  aiAnalysis.value = null
  try {
    const enrichRes = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: token.address })
    })
    const enrichedData = await enrichRes.json()
    enrichedData.overview = { extensions: token.socials }

    const tokenPayload = { ...token, price: token.price || 0.000001 }
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenPayload, enriched: enrichedData })
    })
    
    const result = await res.json()
    aiAnalysis.value = { ...result, token: tokenPayload }
  } catch (e) { console.error(e) } 
  finally { processingId.value = null }
}

// --- ACTIONS: AI (MANAGE POSITION) ---
const askAiToManage = async (trade: any) => {
  processingId.value = trade.id
  manageAdvice.value = null

  try {
    const durationMins = Math.floor((Date.now() - trade.timestamp) / 60000)
    const res = await fetch('/api/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        currentPrice: trade.currentPrice || trade.entryPrice, 
        durationMins
      })
    })
    const result = await res.json()
    manageAdvice.value = { ...result, tradeId: trade.id, symbol: trade.symbol }
  } catch (e) { console.error(e) }
  finally { processingId.value = null }
}

// --- BUY / SELL LOGIC ---
const openBuyModal = (token: any) => {
  if (!token.price) token.price = 0.000001; 
  selectedToken.value = token
  showBuyModal.value = true
}

const executeBuy = async () => {
  if (!selectedToken.value) return
  isBuying.value = true
  
  try {
    const tradeToken = { ...selectedToken.value, address: selectedToken.value.address }
    const res = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'OPEN', token: tradeToken, amount: buyAmount.value })
    })
    const json = await res.json()
    
    if(json.success) {
      showBuyModal.value = false
      aiAnalysis.value = null
      activeTab.value = 'positions'
      fetchPortfolio()
    }
  } catch(e) { alert("Trade Failed") } 
  finally { isBuying.value = false }
}

const closePosition = async (trade: any) => {
   const currentPrice = trade.currentPrice || trade.entryPrice
   const res = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLOSE', tradeId: trade.id, currentPrice: currentPrice }) 
    })
    const json = await res.json()
    if(json.success) { 
      manageAdvice.value = null // Close advice modal if open
      fetchPortfolio() 
    }
}

// --- WALLET ACTIONS ---
const fetchBalance = async () => {
  if (!publicKey.value) return
  try {
    const bal = await connection.getBalance(publicKey.value)
    balance.value = bal / LAMPORTS_PER_SOL
  } catch (err) { console.error(err) }
}

const handleAirdrop = async () => {
  if (!publicKey.value) return
  airdropping.value = true
  try {
    const signature = await connection.requestAirdrop(publicKey.value, 1 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: signature,
    });
    alert("1 SOL Airdropped Successfully!")
    fetchBalance()
  } catch (err) { alert("Airdrop failed.") } 
  finally { airdropping.value = false }
}

watch(activeTab, (newTab) => {
  if (newTab === 'positions') {
    startPortfolioMonitor()
  } else {
    stopPortfolioMonitor()
  }
  if (newTab === 'wallet') fetchBalance()
})

onMounted(() => {
  if (connected.value) fetchBalance()
})

onUnmounted(() => {
  stopPortfolioMonitor()
})
</script>

<template>
  <div class="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden min-h-[600px] flex flex-col relative">
    
    <!-- === MODALS === -->
    <!-- 1. BUY MODAL -->
    <div v-if="showBuyModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-600 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in">
        <div class="flex justify-between items-start mb-6">
          <div class="flex items-center gap-3">
            <img v-if="selectedToken.logoURI" :src="selectedToken.logoURI" class="w-12 h-12 rounded-full bg-black" />
            <div>
              <h3 class="text-xl font-bold text-white">Buy {{ selectedToken.symbol }}</h3>
              <p class="text-xs text-slate-400 font-mono">${{ selectedToken.price?.toFixed(8) }}</p>
            </div>
          </div>
          <button @click="showBuyModal = false" class="text-slate-500 hover:text-white text-2xl">&times;</button>
        </div>
        <div class="mb-6">
          <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Investment Amount (USD)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input type="number" v-model="buyAmount" class="w-full bg-slate-800 border border-slate-600 rounded-xl py-4 pl-8 pr-4 text-2xl font-bold text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"/>
          </div>
          <div class="flex gap-2 mt-3">
            <button @click="buyAmount = 10" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 10 ? 'border-green-500 text-green-400' : ''">$10</button>
            <button @click="buyAmount = 50" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 50 ? 'border-green-500 text-green-400' : ''">$50</button>
            <button @click="buyAmount = 100" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 100 ? 'border-green-500 text-green-400' : ''">$100</button>
          </div>
        </div>
        <button @click="executeBuy" :disabled="isBuying" class="w-full py-4 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-400 text-black transition-all shadow-lg shadow-green-900/20 disabled:opacity-50">{{ isBuying ? 'Executing...' : `Confirm Buy ($${buyAmount})` }}</button>
      </div>
    </div>

    <!-- 2. MANAGER ADVICE MODAL -->
    <div v-if="manageAdvice" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-blue-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in relative">
        <button @click="manageAdvice = null" class="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold text-white">Manager: {{ manageAdvice.symbol }}</h3>
            <p class="text-sm text-blue-300">Position Strategy</p>
          </div>
          <div class="px-4 py-2 rounded-lg font-bold text-xl border" 
               :class="manageAdvice.decision === 'SELL' ? 'bg-red-500 text-white border-red-400' : 'bg-blue-500 text-black border-blue-400'">
            {{ manageAdvice.decision }} ({{ manageAdvice.confidence }}%)
          </div>
        </div>
        <p class="text-slate-300 italic mb-6 text-lg leading-relaxed">"{{ manageAdvice.reasoning }}"</p>
        <div class="flex gap-4">
          <button v-if="manageAdvice.decision === 'SELL'" @click="closePosition(activeTrades.find(t => t.id === manageAdvice.tradeId))" class="flex-1 py-3 rounded-lg font-bold bg-red-500 hover:bg-red-400 text-white">Execute SELL</button>
          <button @click="manageAdvice = null" class="flex-1 py-3 rounded-lg font-bold bg-slate-700 hover:bg-slate-600">Keep Holding</button>
        </div>
      </div>
    </div>

    <!-- HEADER -->
    <div class="p-6 border-b border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50">
      <div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          AITrader <span class="text-xs bg-slate-700 text-white px-2 py-0.5 rounded uppercase ml-2">SIMULATION</span>
        </h1>
      </div>
      <WalletMultiButton dark />
    </div>

    <!-- TABS -->
    <div class="flex border-b border-slate-700 bg-slate-800 overflow-x-auto">
      <button v-for="tab in ['hunter', 'positions', 'wallet']" :key="tab" @click="activeTab = tab as any" class="flex-1 py-4 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap" :class="activeTab === tab ? 'bg-slate-700 text-white border-purple-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'">{{ tab === 'hunter' ? '💎 Gem Hunter' : (tab === 'positions' ? '📈 Portfolio' : '💳 Wallet') }}</button>
    </div>

    <!-- CONTENT -->
    <div class="p-6 flex-1 bg-slate-800">

      <!-- AI ANALYSIS POPUP (NEW TOKEN) -->
      <div v-if="aiAnalysis" class="bg-slate-900 border border-purple-500/50 p-6 rounded-xl animate-fade-in shadow-2xl relative mb-6">
        <button @click="aiAnalysis = null" class="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold text-white">Analysis: ${{ aiAnalysis.token.symbol }}</h3>
            <p class="text-sm text-purple-300">Gemini Risk Engine</p>
          </div>
          <div class="px-4 py-2 rounded-lg font-bold text-xl border" :class="aiAnalysis.decision === 'BUY' ? 'bg-green-500 text-black border-green-400' : (aiAnalysis.decision === 'AVOID' ? 'bg-red-500 text-white border-red-400' : 'bg-yellow-500 text-black border-yellow-400')">{{ aiAnalysis.decision }} ({{ aiAnalysis.confidence }}%)</div>
        </div>
        <p class="text-slate-300 italic mb-6 text-lg leading-relaxed">"{{ aiAnalysis.reasoning }}"</p>
        <div class="flex gap-4" v-if="aiAnalysis.decision !== 'AVOID'">
          <button @click="openBuyModal(aiAnalysis.token)" class="flex-1 py-3 rounded-lg font-bold bg-green-500 hover:bg-green-400 text-black transition-transform hover:scale-[1.02]">🚀 Trade Now</button>
        </div>
      </div>
      
      <!-- === TAB: GEM HUNTER === -->
      <div v-if="activeTab === 'hunter'" class="space-y-6">
        <div class="bg-black/30 border border-slate-600 rounded-xl p-4">
          <div class="flex justify-center mb-4">
            <div class="bg-slate-900 p-1 rounded-lg flex shadow-inner">
              <button @click="hunterMode = 'trending'" class="px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'trending' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'">🔥 Trending</button>
              <button @click="hunterMode = 'fresh'" class="px-4 py-2 rounded-md text-xs font-bold transition-all" :class="hunterMode === 'fresh' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'">⚡ Fresh</button>
            </div>
          </div>
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-xl font-bold text-white" v-if="hunterMode === 'trending'">Trend Scanner</h2>
              <h2 class="text-xl font-bold text-white" v-else>Sniper Scanner</h2>
              <p class="text-xs text-slate-400">Queue Size: {{ processingQueue.length }}</p>
            </div>
            <div class="flex gap-3">
              <label class="flex items-center gap-2 text-xs text-slate-400">Min Liq: <input type="number" v-model="minLiquidity" class="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"></label>
              <button @click="fetchAndQueue" :disabled="loadingHunter" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors"><span v-if="loadingHunter" class="animate-spin">↻</span> {{ loadingHunter ? 'Fetching...' : '1. Load Batch' }}</button>
              <button @click="toggleSieve" :disabled="processingQueue.length === 0" class="px-6 py-2 rounded-lg font-bold text-xs transition-all shadow-lg" :class="isSieveRunning ? 'bg-red-600 hover:bg-red-500 animate-pulse' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:opacity-50'">{{ isSieveRunning ? 'STOP' : '2. START CHECK' }}</button>
            </div>
          </div>
          <div class="bg-slate-900 rounded-full h-4 overflow-hidden relative border border-slate-700">
             <div class="h-full bg-blue-500 transition-all duration-300 ease-linear" :style="{ width: processingQueue.length > 0 ? '100%' : '0%' }"></div>
             <div class="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">{{ currentChecking || 'Ready' }}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- VERIFIED -->
          <div class="lg:col-span-2 space-y-4">
            <h3 class="text-green-400 font-bold uppercase tracking-widest text-sm border-b border-green-900 pb-2">✅ Verified Candidates ({{ verifiedTokens.length }})</h3>
            <div v-if="verifiedTokens.length === 0" class="p-10 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700 text-slate-500">No candidates yet. Load batch and check.</div>
            <div v-else class="grid gap-3">
              <div v-for="token in verifiedTokens" :key="token.address" class="bg-slate-900 border border-slate-700 p-4 rounded-xl hover:border-green-500 transition-all shadow-lg">
                <div class="flex justify-between items-start">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold overflow-hidden border border-slate-600">
                        <img v-if="token.logoURI" :src="token.logoURI" class="w-full h-full object-cover" />
                        <span v-else>{{ token.symbol?.substring(0,2) }}</span>
                    </div>
                    <div>
                      <div class="font-bold text-lg flex items-center gap-2">
                        {{ token.symbol }}
                        <span v-if="token.isNew" class="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-700">{{ formatTimeAgo(token.liquidityAddedAt) }}</span>
                        <span v-else class="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">#{{ token.rank }}</span>
                        <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-500 hover:text-white" title="View on BirdEye">↗</a>
                      </div>
                      <div class="flex gap-2 mt-2">
                        <a v-if="token.socials?.website" :href="token.socials.website" target="_blank" class="flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded font-bold transition-colors">🌐 Website</a>
                        <a v-if="token.socials?.twitter" :href="token.socials.twitter" target="_blank" class="flex items-center gap-1 text-[10px] bg-black hover:bg-gray-800 text-white px-2 py-1 rounded font-bold transition-colors border border-slate-700">𝕏 Twitter</a>
                        <a v-if="token.socials?.telegram" :href="token.socials.telegram" target="_blank" class="flex items-center gap-1 text-[10px] bg-blue-500 hover:bg-blue-400 text-white px-2 py-1 rounded font-bold transition-colors">✈ Telegram</a>
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-xl font-mono font-bold" :class="token.price24hChangePercent > 0 ? 'text-green-400' : 'text-red-400'">{{ token.price24hChangePercent?.toFixed(0) }}%</div>
                    <div class="text-xs text-slate-400">24h Change</div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4 my-3 bg-black/20 p-3 rounded-lg text-xs border border-slate-800">
                  <div class="flex justify-between"><span class="text-slate-500">Liquidity</span> <span class="font-mono text-green-300">{{ formatVal(token.liquidity) }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-500">Volume</span> <span class="font-mono text-blue-300">{{ formatVal(token.v24hUSD) }}</span></div>
                </div>
                <button @click="analyzeToken(token)" :disabled="processingId === token.address" class="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold text-sm disabled:opacity-50 shadow-purple-900/20 shadow-lg transition-all hover:translate-y-[-1px]">{{ processingId === token.address ? 'Running AI...' : '🤖 Ask Gemini Intelligence' }}</button>
              </div>
            </div>
          </div>
          <!-- REJECTED -->
          <div class="lg:col-span-1">
            <h3 class="text-slate-500 font-bold uppercase tracking-widest text-sm border-b border-slate-800 pb-2">🗑️ Rejected ({{ rejectedTokens.length }})</h3>
            <div class="bg-black/20 rounded-xl border border-slate-800 h-[500px] overflow-y-auto p-2">
              <div v-for="(token, i) in rejectedTokens" :key="i" class="flex justify-between items-center py-2 border-b border-slate-800/50 text-xs group hover:bg-slate-800/50 px-2 rounded transition-colors">
                <div class="flex items-center gap-2 overflow-hidden">
                  <a :href="getExplorerLink(token.address)" target="_blank" class="text-slate-400 hover:text-white flex items-center gap-1 min-w-0"><span class="font-bold truncate max-w-[80px]">{{ token.symbol }}</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 opacity-0 group-hover:opacity-100"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" /></svg></a>
                </div>
                <div class="text-right flex flex-col">
                  <span class="font-mono text-slate-500" v-if="token.isNew">{{ formatTimeAgo(token.liquidityAddedAt) }}</span>
                  <span class="font-mono text-slate-500" v-else>#{{ token.rank }}</span>
                  <span class="text-[10px] text-red-400">{{ token.rejectReason }}</span>
                </div>
              </div>
              <div v-if="rejectedTokens.length === 0" class="text-center pt-10 text-slate-600 text-xs">Empty</div>
            </div>
          </div>
        </div>
      </div>

      <!-- === TAB: POSITIONS (UPDATED) === -->
      <div v-if="activeTab === 'positions'" class="space-y-6">
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
                <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs overflow-hidden">
                   <img v-if="trade.logoURI" :src="trade.logoURI" class="w-full h-full object-cover" />
                   <span v-else>{{ trade.symbol.substring(0,2) }}</span>
                </div>
                <div>
                  <div class="font-bold text-white text-lg">{{ trade.symbol }}</div>
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
              <button @click="askAiToManage(trade)" :disabled="processingId === trade.id" class="flex-1 py-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded text-xs font-bold border border-blue-900">{{ processingId === trade.id ? 'Thinking...' : 'Check AI' }}</button>
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
                <div class="bg-black/40 px-3 py-1 rounded border border-slate-700">
                   <span class="text-slate-500 mr-2">Win Rate</span>
                   <span class="font-bold" :class="historyStats.winRate >= 50 ? 'text-green-400' : 'text-orange-400'">{{ historyStats.winRate.toFixed(0) }}%</span>
                </div>
             </div>
          </div>
          <div class="bg-black/20 rounded-xl border border-slate-800 overflow-hidden">
            <table class="w-full text-left text-sm">
              <thead class="text-xs uppercase bg-slate-900/50 text-slate-500">
                <tr><th class="p-3">Token</th><th class="p-3 text-right">Invested</th><th class="p-3 text-right">Return %</th><th class="p-3 text-right">PnL</th></tr>
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

      <!-- === TAB: WALLET === -->
      <div v-if="activeTab === 'wallet'" class="max-w-2xl mx-auto space-y-6 p-6">
        <div class="bg-black/20 p-6 rounded-xl border border-slate-600 text-center">
            <p class="text-slate-400 text-sm">Devnet SOL Balance</p>
            <h2 class="text-4xl font-bold text-white mt-2">{{ balance?.toFixed(4) }} SOL</h2>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <button @click="fetchBalance" class="py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-colors">Refresh Balance</button>
          <button v-if="network === 'devnet'" @click="handleAirdrop" :disabled="airdropping" class="py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
            <span v-if="airdropping" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            {{ airdropping ? 'Airdropping...' : 'Faucet (+1 SOL)' }}
          </button>
        </div>
      </div>

    </div>
  </div>
</template>