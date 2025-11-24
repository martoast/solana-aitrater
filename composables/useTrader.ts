import { ref, computed, watch } from 'vue'
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useWallet } from 'solana-wallets-vue'

// --- GLOBAL STATE (Singleton) ---
const activeTab = ref<'hunter' | 'positions' | 'wallet'>('hunter')
const hunterMode = ref<'trending' | 'fresh'>('fresh')
const balance = ref<number | null>(null)

// Data
const verifiedTokens = ref<any[]>([])
const rejectedTokens = ref<any[]>([])
const processingQueue = ref<any[]>([])
const activeTrades = ref<any[]>([])
const tradeHistory = ref<any[]>([])
const checkedCache = ref(new Set<string>())

// Filters
const minLiquidity = ref(5000)
const minVolume = ref(1000)

// UI/Loading States
const loadingHunter = ref(false)
const loadingPortfolio = ref(false)
const isRefreshing = ref(false)
const isSieveRunning = ref(false)
const currentChecking = ref<string>('')
const isUpdatingVerified = ref(false)
const isBatchAnalyzing = ref(false)
const airdropping = ref(false)
const processingId = ref<string | null>(null)

// Modals State
const aiAnalysis = ref<any>(null)
const manageAdvice = ref<any>(null)
const showBuyModal = ref(false)
const selectedToken = ref<any>(null)
const buyAmount = ref(10)
const isBuying = ref(false)

// Timers
let scanTimer: any = null
let portfolioTimer: any = null

export const useTrader = () => {
  const config = useRuntimeConfig()
  const { publicKey } = useWallet()
  const network = config.public.solanaNetwork as string
  
  // --- HELPERS ---
  const formatVal = (num: number) => {
    const n = Number(num)
    if (!n || isNaN(n)) return '$0'
    if (n > 1000000) return `$${(n/1000000).toFixed(1)}M`
    if (n > 1000) return `$${(n/1000).toFixed(1)}K`
    return `$${Math.floor(n).toLocaleString()}`
  }

  const formatPrice = (num: number | string) => {
    const n = Number(num)
    if (!n || isNaN(n)) return '0.000000'
    return n < 0.01 ? n.toFixed(8) : n.toFixed(4)
  }

  const formatTimeAgo = (isoDate: string) => {
    if (!isoDate) return ''
    const dateStr = isoDate.endsWith('Z') ? isoDate : `${isoDate}Z`
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins/60)}h ago`
  }

  const getExplorerLink = (address: string) => `https://birdeye.so/token/${address}?chain=solana`

  // --- COMPUTED ---
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

  const historyStats = computed(() => {
    const closed = tradeHistory.value || []
    if (closed.length === 0) return { realizedPnL: 0, winRate: 0, avgReturn: 0, totalTrades: 0 }
    const realizedPnL = closed.reduce((acc, t) => acc + (t.pnl || 0), 0)
    const wins = closed.filter(t => (t.pnl || 0) > 0).length
    const winRate = (wins / closed.length) * 100
    const totalRoi = closed.reduce((acc, t) => {
      if (!t.exitPrice || !t.entryPrice) return acc
      return acc + (((t.exitPrice - t.entryPrice) / t.entryPrice) * 100)
    }, 0)
    return { realizedPnL, winRate, avgReturn: totalRoi / closed.length, totalTrades: closed.length }
  })

  // --- API ACTIONS ---
  const fetchBatchPrices = async (addresses: string[]) => {
    if (addresses.length === 0) return {}
    const chunkSize = 30
    let combinedData = {}
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize)
      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: chunk })
        })
        const json = await res.json()
        if (json.success) combinedData = { ...combinedData, ...json.data }
      } catch (e) { console.error("Batch fetch error", e) }
    }
    return combinedData
  }

  // --- PORTFOLIO LOGIC ---
  const refreshPortfolioPrices = async () => {
    if (activeTrades.value.length === 0) return
    isRefreshing.value = true
    try {
      const addresses = activeTrades.value.map(t => t.address).filter(a => a)
      if (addresses.length === 0) return
      const marketMap: any = await fetchBatchPrices(addresses)
      activeTrades.value.forEach(trade => {
        const fresh = marketMap[trade.address]
        if (fresh) {
          trade.currentPrice = Number(fresh.price)
          const currentValue = (trade.amount / trade.entryPrice) * trade.currentPrice
          trade.currentValue = currentValue
          trade.pnl = currentValue - trade.amount
          trade.pnlPercent = ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        }
      })
    } catch (e) { console.error(e) }
    finally { isRefreshing.value = false }
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

  const startPortfolioMonitor = () => {
    fetchPortfolio()
    if (portfolioTimer) clearInterval(portfolioTimer)
    portfolioTimer = setInterval(refreshPortfolioPrices, 3000)
  }
  
  const stopPortfolioMonitor = () => {
    if (portfolioTimer) clearInterval(portfolioTimer)
  }

  // --- HUNTER / SIEVE LOGIC ---
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
         token.liquidity = parseFloat(data.overview.liquidity || 0)
         token.v24hUSD = parseFloat(data.overview.volume?.h24 || 0)
         token.price24hChangePercent = parseFloat(data.overview.priceChange?.h24 || 0)
         token.priceChange5m = parseFloat(data.overview.priceChange?.m5 || 0)
         token.priceChange1h = parseFloat(data.overview.priceChange?.h1 || 0)
         token.price = parseFloat(data.overview.price || 0)
         
         token.socials = {
           website: token.prefilledSocials?.website || data.socials?.website,
           twitter: token.prefilledSocials?.twitter || data.socials?.twitter,
           telegram: token.prefilledSocials?.telegram || data.socials?.telegram,
         }
         token.logoURI = data.logoURI || token.logoURI
      }
  
      const hasSocials = token.socials?.website || token.socials?.twitter || token.socials?.telegram
      const hasLiquidity = token.liquidity >= minLiquidity.value
      const hasVolume = token.v24hUSD >= minVolume.value
  
      if (hasSocials && hasLiquidity && hasVolume) {
         currentChecking.value = `AI Analyzing ${token.symbol}...`
         const tokenPayload = { ...token }
         const enrichedData = { data: data.overview, overview: { extensions: token.socials } }
         const aiRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenPayload, enriched: enrichedData })
         })
         const aiResult = await aiRes.json()

         token.aiScore = aiResult.confidence
         token.aiDecision = aiResult.decision
         token.aiReason = aiResult.reason

         if (aiResult.decision === 'AVOID') {
            token.rejectReason = `AI Reject: ${aiResult.reason.slice(0, 30)}...`
            rejectedTokens.value.unshift(token)
         } else {
            verifiedTokens.value.unshift(token) 
         }
      } else {
         if (!hasSocials) token.rejectReason = 'No Socials'
         else if (!hasLiquidity) token.rejectReason = `Liq ${formatVal(token.liquidity)}`
         else if (!hasVolume) token.rejectReason = `Vol ${formatVal(token.v24hUSD)}`
         rejectedTokens.value.unshift(token) 
      }
    } catch (e) {
      token.rejectReason = 'API Error'
      rejectedTokens.value.unshift(token)
    } finally {
      setTimeout(() => { processNextInQueue() }, 500)
    }
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

  const refreshVerifiedPrices = async () => {
    if (verifiedTokens.value.length === 0) return
    isUpdatingVerified.value = true
    const addresses = verifiedTokens.value.map(t => t.address)
    const marketMap: any = await fetchBatchPrices(addresses)
    verifiedTokens.value.forEach(token => {
      const fresh = marketMap[token.address]
      if (fresh) Object.assign(token, fresh)
    })
    isUpdatingVerified.value = false
  }

  // --- MANUAL AI CHECK (FIXED: UPDATES CARD DATA) ---
  const analyzeToken = async (token: any) => {
    processingId.value = token.address
    aiAnalysis.value = null
    try {
      const res = await fetch('/api/check-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: token.address })
      })
      const data = await res.json()
      
      const safePrice = Number(data.overview?.price || token.price)
      const tokenPayload = { ...token, price: isNaN(safePrice) ? 0.000001 : safePrice }
      const enrichedData = { data: data.overview, overview: { extensions: token.socials } }

      const aiRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenPayload, enriched: enrichedData })
      })
      const result = await aiRes.json()
      
      // --- UPDATE MASTER STATE HERE ---
      const verifiedIndex = verifiedTokens.value.findIndex(t => t.address === token.address)
      if (verifiedIndex !== -1) {
         verifiedTokens.value[verifiedIndex].aiScore = result.confidence
         verifiedTokens.value[verifiedIndex].aiDecision = result.decision
         verifiedTokens.value[verifiedIndex].aiReason = result.reason
         
         // Update market data if fresh from check-metadata
         if (data.overview) {
            verifiedTokens.value[verifiedIndex].price = safePrice
            verifiedTokens.value[verifiedIndex].liquidity = Number(data.overview.liquidity)
            verifiedTokens.value[verifiedIndex].v24hUSD = Number(data.overview.volume?.h24)
            // CRITICAL: Update the 5m/1h change so the UI refreshes
            verifiedTokens.value[verifiedIndex].price24hChangePercent = Number(data.overview.priceChange?.h24)
            verifiedTokens.value[verifiedIndex].priceChange5m = Number(data.overview.priceChange?.m5)
            verifiedTokens.value[verifiedIndex].priceChange1h = Number(data.overview.priceChange?.h1)
         }
      }

      aiAnalysis.value = { ...result, token: tokenPayload }
    } catch (e) { console.error(e) } 
    finally { processingId.value = null }
  }

  // --- BATCH ANALYSIS (FIXED) ---
  const runBatchAnalysis = async () => {
    const tokensToAnalyze = verifiedTokens.value.filter(t => !t.aiScore)
    if (tokensToAnalyze.length === 0) return

    isBatchAnalyzing.value = true
    try {
      const res = await fetch('/api/batch-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokensToAnalyze })
      })
      const json = await res.json()

      if (json.success && json.results) {
        verifiedTokens.value.forEach(token => {
          const result = json.results[token.address]
          if (result) {
            token.aiScore = result.score
            token.aiTag = result.tag
            token.aiReason = result.reason
            // Map generic decision from tag
            if (result.score >= 80) token.aiDecision = 'BUY'
            else if (result.score <= 30) token.aiDecision = 'AVOID'
            else token.aiDecision = 'WAIT'
          }
        })
      }
    } catch (e) { console.error(e) }
    finally { isBatchAnalyzing.value = false }
  }

  // --- TRADING ACTIONS ---
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

  const openBuyModal = (token: any) => {
    const safePrice = Number(token.price)
    selectedToken.value = { 
        ...token, 
        price: isNaN(safePrice) || safePrice === 0 ? 0.000001 : safePrice 
    }
    aiAnalysis.value = null 
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
        manageAdvice.value = null
        fetchPortfolio() 
      }
  }

  const fetchBalance = async () => {
    if (!publicKey.value) return
    try {
      const connection = new Connection(clusterApiUrl(network as any), 'confirmed')
      const bal = await connection.getBalance(publicKey.value)
      balance.value = bal / LAMPORTS_PER_SOL
    } catch (err) { console.error(err) }
  }

  const handleAirdrop = async () => {
    if (!publicKey.value) return
    airdropping.value = true
    try {
      const connection = new Connection(clusterApiUrl(network as any), 'confirmed')
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
    if (newTab === 'positions') startPortfolioMonitor()
    else stopPortfolioMonitor()
    if (newTab === 'wallet') fetchBalance()
  })

  return {
    activeTab, hunterMode, balance, verifiedTokens, rejectedTokens, 
    processingQueue, activeTrades, tradeHistory, isSieveRunning, 
    currentChecking, minLiquidity, minVolume, loadingHunter, 
    loadingPortfolio, isRefreshing, airdropping, processingId, 
    aiAnalysis, manageAdvice, showBuyModal, buyAmount, selectedToken, isBuying,
    totalPortfolioValue, totalPnL, historyStats, isUpdatingVerified, isBatchAnalyzing,
    network,
    
    fetchAndQueue, toggleSieve, refreshVerifiedPrices, runBatchAnalysis,
    analyzeToken, openBuyModal, executeBuy, closePosition, askAiToManage,
    fetchBalance, handleAirdrop, fetchPortfolio, startPortfolioMonitor, stopPortfolioMonitor,
    
    formatVal, getExplorerLink, formatTimeAgo, formatPrice
  }
}