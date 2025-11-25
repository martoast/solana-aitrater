import { ref, computed, watch } from "vue";

// === GLOBAL STATE ===
const discoveryQueue = ref<any[]>([]);
const verifiedTokens = ref<any[]>([]);
const rejectedTokens = ref<any[]>([]);
const activeTrades = ref<any[]>([]);
const tradeHistory = ref<any[]>([]); // Holds the DB history

// === CACHES & INTERNALS ===
const checkedCache = ref<Map<string, number>>(new Map());
const CACHE_TTL_MS = 3 * 60 * 1000; 
const VERIFIED_MAX_AGE_MS = 15 * 60 * 1000;
const MAX_VERIFIED_POOL = 100;
const MAX_DISCOVERY_QUEUE = 1000;
const minLiquidity = ref(5000);

// === BOT SETTINGS ===
const isAutoTrading = ref(false);
const botSettings = ref({
  buyAmount: 20,
  takeProfit: 8,
  stopLoss: 5,
  maxPositions: 5,
  minScore: 70,
  weights: {
    priceChange5m: 25,
    priceChange1h: 20,
    alignment: 15,
    buyPressure: 20,
    volumeSpike: 10,
    liquidityHealth: 10,
  },
  thresholds: {
    strongMomentum5m: 5,
    goodMomentum5m: 2,
    strongMomentum1h: 10,
    goodMomentum1h: 5,
    strongBuyRatio: 1.5,
    goodBuyRatio: 1.2,
  },
});
const botLogs = ref<string[]>([]);

// === UI STATES ===
const isSieveRunning = ref(false);
const isScoringRunning = ref(false);
const currentChecking = ref<string>("Idle");
const showBuyModal = ref(false);
const selectedToken = ref<any>(null);
const buyAmount = ref(10);
const isBuying = ref(false);

// === STATS ===
const stats = ref({
  totalDiscovered: 0,
  totalChecked: 0,
  totalVerified: 0,
  totalRejected: 0,
  totalBought: 0,
  totalScored: 0,
  scoringCycles: 0,
  lastScoringTime: 0,
});

// === TIMERS ===
let portfolioTimer: ReturnType<typeof setInterval> | null = null;
let discoveryTimer: ReturnType<typeof setInterval> | null = null;
let sieveTimer: ReturnType<typeof setTimeout> | null = null;
let scoringTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export const useTrader = () => {
  // === LOGGING ===
  const log = (msg: string, type: "info" | "success" | "error" | "warn" | "trade" | "scan" | "score" = "info") => {
    const time = new Date().toLocaleTimeString();
    const prefix = { success: "✅", error: "❌", warn: "⚠️", trade: "💰", scan: "📡", score: "🎯", info: "ℹ️" }[type];
    botLogs.value.unshift(`[${time}] ${prefix} ${msg}`);
    if (botLogs.value.length > 300) botLogs.value.pop();
  };

  // === FORMATTING ===
  const formatVal = (num: number) => {
    const n = Number(num);
    if (!n || isNaN(n)) return "$0";
    if (n > 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n > 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${Math.floor(n).toLocaleString()}`;
  };

  const formatPrice = (num: number | string) => {
    const n = Number(num);
    if (!n || isNaN(n)) return "0.000000";
    return n < 0.01 ? n.toFixed(8) : n.toFixed(4);
  };

  const formatTimeAgo = (timestamp: string | number) => {
    if (!timestamp) return "";
    const ts = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  const getExplorerLink = (address: string) => `https://birdeye.so/token/${address}?chain=solana`;

  // === COMPUTED ===
  const totalPortfolioValue = computed(() => {
    return activeTrades.value.reduce((acc, t) => {
      const val = t.currentPrice ? (t.amount / t.entryPrice) * t.currentPrice : t.amount;
      return acc + val;
    }, 0);
  });

  const totalPnL = computed(() => {
    const invested = activeTrades.value.reduce((acc, t) => acc + t.amount, 0);
    return totalPortfolioValue.value - invested;
  });

  const historyStats = computed(() => {
    const closed = tradeHistory.value || [];
    if (closed.length === 0) return { realizedPnL: 0, winRate: 0, avgReturn: 0, totalTrades: 0 };
    
    const realizedPnL = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
    const winRate = (wins / closed.length) * 100;
    const avgReturn = closed.reduce((acc, t) => {
        if(!t.exitPrice || !t.entryPrice) return acc;
        return acc + (((t.exitPrice - t.entryPrice) / t.entryPrice) * 100);
    }, 0) / closed.length;
    
    return { realizedPnL, winRate, avgReturn, totalTrades: closed.length };
  });

  // === DATA FETCHING ===
  const fetchBatchTokenData = async (addresses: string[]): Promise<Record<string, any>> => {
    if (addresses.length === 0) return {};
    const results: Record<string, any> = {};
    const chunkSize = 30;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      try {
        const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, { headers: { Accept: "application/json" } });
        const pairs = await response.json();
        if (Array.isArray(pairs)) {
          const tokenMap: Record<string, any> = {};
          for (const pair of pairs) {
            const addr = pair.baseToken?.address;
            if (!addr) continue;
            const liq = pair.liquidity?.usd || 0;
            if (!tokenMap[addr] || liq > (tokenMap[addr].liquidity?.usd || 0)) tokenMap[addr] = pair;
          }
          for (const [addr, pair] of Object.entries(tokenMap)) {
            results[addr] = {
              price: parseFloat(pair.priceUsd) || 0,
              liquidity: pair.liquidity?.usd || 0,
              fdv: pair.fdv || 0,
              priceChange5m: pair.priceChange?.m5 || 0,
              priceChange1h: pair.priceChange?.h1 || 0,
              volume5m: pair.volume?.m5 || 0,
              volume1h: pair.volume?.h1 || 0,
              txns1h: pair.txns?.h1 || { buys: 0, sells: 0 },
            };
          }
        }
      } catch (e) { console.error("Batch fetch error:", e); }
    }
    return results;
  };

  // === CORE FUNCTIONS ===
  const calculateScore = (token: any) => {
    const w = botSettings.value.weights;
    const t = botSettings.value.thresholds;
    let score = 0;
    const breakdown: any = {};

    // 1. Momentum 5m
    const change5m = token.priceChange5m || 0;
    if (change5m >= t.strongMomentum5m) score += w.priceChange5m;
    else if (change5m >= t.goodMomentum5m) score += Math.round(w.priceChange5m * 0.6);
    else if (change5m <= -t.strongMomentum5m) score -= Math.round(w.priceChange5m * 0.5);

    // 2. Trend 1h
    const change1h = token.priceChange1h || 0;
    if (change1h >= t.strongMomentum1h) score += w.priceChange1h;
    else if (change1h >= t.goodMomentum1h) score += Math.round(w.priceChange1h * 0.6);

    // 3. Alignment
    if (change5m > 0 && change1h > 0) score += w.alignment;
    else if ((change5m > 0 && change1h < 0) || (change5m < 0 && change1h > 0)) score -= Math.round(w.alignment * 0.3);

    // 4. Buy Pressure
    const buys = token.txns1h?.buys || 0;
    const sells = token.txns1h?.sells || 0;
    const ratio = sells > 0 ? buys / sells : buys > 0 ? 2 : 1;
    if (ratio >= t.strongBuyRatio) score += w.buyPressure;
    else if (ratio < 0.8) score -= Math.round(w.buyPressure * 0.5);

    // 5. Volume
    const vol5m = token.volume5m || 0;
    const avgVol = (token.volume1h || 0) / 12;
    if (vol5m > avgVol * 2) score += w.volumeSpike;

    // 6. Liquidity
    const liq = token.liquidity || 0;
    if (liq >= 20000) score += w.liquidityHealth;
    else if (liq < 5000) score -= 10;

    score = Math.max(0, Math.min(100, score));
    let signal = "WAIT";
    if (score >= botSettings.value.minScore && change5m > 0) signal = "BUY";
    else if (score < 30 || change5m < -5) signal = "AVOID";

    return { score, breakdown, signal };
  };

  const runDiscovery = async () => {
    try {
      const res = await fetch("/api/hunter?type=auto");
      const json = await res.json();
      if (json.success && json.data?.items) {
        const now = Date.now();
        let addedCount = 0;
        for (const token of json.data.items) {
          if (!token.address) continue;
          if (checkedCache.value.get(token.address)) continue;
          if (verifiedTokens.value.some((v) => v.address === token.address)) continue;
          if (discoveryQueue.value.some((d) => d.address === token.address)) continue;
          if (activeTrades.value.some((t) => t.address === token.address)) continue;
          discoveryQueue.value.push({ ...token, discoveredAt: now });
          addedCount++;
          stats.value.totalDiscovered++;
        }
        if (discoveryQueue.value.length > MAX_DISCOVERY_QUEUE) discoveryQueue.value = discoveryQueue.value.slice(-MAX_DISCOVERY_QUEUE);
        if (addedCount > 0) log(`${json.source}: +${addedCount} tokens`, "scan");
      }
    } catch (e) { console.error("Discovery error:", e); }
  };

  const processSieveItem = async () => {
    if (discoveryQueue.value.length === 0) { currentChecking.value = "Queue empty..."; return; }
    const token = discoveryQueue.value.shift()!;
    const now = Date.now();
    checkedCache.value.set(token.address, now);
    stats.value.totalChecked++;
    currentChecking.value = `Sieve: ${token.symbol}`;
    try {
      const data = await fetchBatchTokenData([token.address]);
      const freshData = data[token.address];
      if (!freshData || !freshData.price) { token.rejectReason = "No data"; rejectedTokens.value.unshift({ ...token }); return; }
      Object.assign(token, freshData);
      if (token.liquidity < minLiquidity.value) { token.rejectReason = `Low Liq: ${formatVal(token.liquidity)}`; rejectedTokens.value.unshift({ ...token }); return; }
      const { score, breakdown, signal } = calculateScore(token);
      token.score = score; token.signal = signal; token.scoreHistory = [{ score, time: now }]; token.verifiedAt = now;
      verifiedTokens.value.unshift(token);
      stats.value.totalVerified++;
      if (verifiedTokens.value.length > MAX_VERIFIED_POOL) verifiedTokens.value = verifiedTokens.value.slice(0, MAX_VERIFIED_POOL);
      log(`✓ ${token.symbol} | Score: ${score}`, "success");
    } catch (e) { token.rejectReason = "Error"; rejectedTokens.value.unshift({ ...token }); }
  };

  const runBatchScoring = async () => {
    if (!isAutoTrading.value || verifiedTokens.value.length === 0 || isScoringRunning.value) return;
    isScoringRunning.value = true;
    const startTime = Date.now();
    try {
      const addresses = verifiedTokens.value.map((t) => t.address);
      currentChecking.value = `Scoring ${addresses.length} tokens...`;
      const freshData = await fetchBatchTokenData(addresses);
      const buySignals: any[] = [];
      const tokensToRemove: string[] = [];
      for (const token of verifiedTokens.value) {
        const data = freshData[token.address];
        if (!data) continue;
        Object.assign(token, data);
        const { score, signal } = calculateScore(token);
        token.score = score; token.signal = signal;
        if (token.scoreHistory) token.scoreHistory.unshift({ score, time: Date.now() });
        if (signal === "BUY" && score >= botSettings.value.minScore) {
            const canBuy = activeTrades.value.length < botSettings.value.maxPositions;
            const notHeld = !activeTrades.value.some(t => t.address === token.address);
            if (canBuy && notHeld) buySignals.push(token);
        }
        if (score < 20) tokensToRemove.push(token.address);
      }
      buySignals.sort((a, b) => b.score - a.score);
      for (const token of buySignals) {
        if (activeTrades.value.length >= botSettings.value.maxPositions) break;
        log(`🎯 BUY SIGNAL: ${token.symbol} | Score: ${token.score}`, "score");
        await executeTradeAction(token, botSettings.value.buyAmount, true);
        tokensToRemove.push(token.address);
      }
      if (tokensToRemove.length > 0) verifiedTokens.value = verifiedTokens.value.filter(t => !tokensToRemove.includes(t.address));
      stats.value.scoringCycles++; stats.value.lastScoringTime = Date.now() - startTime;
    } catch (e) { console.error("Batch scoring error", e); } finally { isScoringRunning.value = false; currentChecking.value = `Scored ${verifiedTokens.value.length} tokens`; }
  };

  const executeTradeAction = async (token: any, amount: number, isAuto: boolean) => {
    try {
      const safePrice = Number(token.price) || 0.000001;
      const res = await fetch("/api/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "OPEN", token: { ...token, price: safePrice }, amount }),
      });
      const result = await res.json();
      if (result.success) {
          // Re-fetch portfolio to get the updated ID and details from Server DB
          await fetchPortfolio();
          stats.value.totalBought++;
          if (isAuto) log(`BUY: $${amount} ${token.symbol}`, "trade");
          else { showBuyModal.value = false; log(`MANUAL BUY: $${amount} ${token.symbol}`, "trade"); }
          return true;
      }
      return false;
    } catch (e) { log(`Trade failed: ${token.symbol}`, "error"); return false; }
  };

  const closePosition = async (trade: any, reason: string = "Manual Close") => {
    try {
        const res = await fetch("/api/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CLOSE", tradeId: trade.id, currentPrice: trade.currentPrice }),
        });
        const result = await res.json();
        if (result.success) {
            await fetchPortfolio(); // Syncs active trades and history
            const pnlPct = trade.pnlPercent || 0;
            log(`SELL: ${trade.symbol} | ${reason} | ${pnlPct.toFixed(2)}%`, pnlPct >= 0 ? "success" : "warn");
        }
    } catch (e) { console.error("Close error", e); }
  };

  const refreshPortfolioPrices = async () => {
    if (activeTrades.value.length === 0) return;
    try {
      const addresses = activeTrades.value.map(t => t.address);
      const freshData = await fetchBatchTokenData(addresses);
      const toClose: { trade: any; reason: string }[] = [];
      activeTrades.value.forEach((trade) => {
        const data = freshData[trade.address];
        if (data?.price) {
          trade.currentPrice = data.price;
          trade.currentValue = (trade.amount / trade.entryPrice) * trade.currentPrice;
          trade.pnl = trade.currentValue - trade.amount;
          trade.pnlPercent = ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
          trade.priceChange5m = data.priceChange5m;
          trade.priceChange1h = data.priceChange1h;
          if (isAutoTrading.value) {
            if (trade.pnlPercent >= botSettings.value.takeProfit) toClose.push({ trade, reason: `TP +${trade.pnlPercent.toFixed(1)}%` });
            else if (trade.pnlPercent <= -botSettings.value.stopLoss) toClose.push({ trade, reason: `SL ${trade.pnlPercent.toFixed(1)}%` });
          }
        }
      });
      for (const { trade, reason } of toClose) await closePosition(trade, reason);
    } catch (e) { console.error("Refresh portfolio error", e); }
  };

  // === CRITICAL: Loads from Server API ===
  const fetchPortfolio = async () => {
    try {
      const res = await fetch("/api/portfolio");
      const json = await res.json();
      
      // Update Active Trades
      activeTrades.value = (json.trades || []).map((t: any) => ({
        ...t,
        currentPrice: t.entryPrice, // Init
        pnl: 0,
        pnlPercent: 0,
        currentValue: t.amount
      }));
      
      // Update History
      tradeHistory.value = json.history || [];
      
      // Refresh prices if there are active trades
      if(activeTrades.value.length > 0) await refreshPortfolioPrices();
      
    } catch (e) {
      console.error("Fetch portfolio error:", e);
    }
  };

  // === BOT CONTROLS ===
  const startBot = () => {
    if (isAutoTrading.value) return;
    isAutoTrading.value = true;
    stats.value.scoringCycles = 0;
    log("🤖 ALEX_BOT STARTED", "success");
    fetchPortfolio();
    runDiscovery(); discoveryTimer = setInterval(runDiscovery, 15000);
    isSieveRunning.value = true;
    const sieveLoop = async () => { if (!isAutoTrading.value) return; await processSieveItem(); sieveTimer = setTimeout(sieveLoop, 300); }; sieveLoop();
    scoringTimer = setInterval(runBatchScoring, 3000); setTimeout(runBatchScoring, 2000);
    portfolioTimer = setInterval(refreshPortfolioPrices, 5000);
    cleanupTimer = setInterval(runCleanup, 45000);
  };

  const StopBot = () => {
    isAutoTrading.value = false; isSieveRunning.value = false; currentChecking.value = "Stopped"; log("🛑 ALEX_BOT STOPPED", "warn");
    if (discoveryTimer) clearInterval(discoveryTimer);
    if (sieveTimer) clearTimeout(sieveTimer);
    if (scoringTimer) clearInterval(scoringTimer);
    if (portfolioTimer) clearInterval(portfolioTimer);
    if (cleanupTimer) clearInterval(cleanupTimer);
  };

  const openBuyModal = (token: any) => { selectedToken.value = { ...token }; showBuyModal.value = true; };
  const executeBuy = async () => { if (!selectedToken.value) return; isBuying.value = true; await executeTradeAction(selectedToken.value, buyAmount.value, false); isBuying.value = false; };
  watch(botSettings, () => { if(typeof window !== "undefined") localStorage.setItem("ai_trader_db", JSON.stringify({ botSettings: botSettings.value, stats: stats.value })); }, { deep: true });

  return {
    isAutoTrading, botSettings, botLogs, totalPortfolioValue, totalPnL, activeTrades, historyStats, currentChecking, discoveryQueue, verifiedTokens, rejectedTokens, showBuyModal, selectedToken, buyAmount, isBuying, stats, isScoringRunning, isSieveRunning, tradeHistory,
    startBot, StopBot, refreshPortfolioPrices, fetchPortfolio, closePosition, openBuyModal, executeBuy, formatVal, formatPrice, formatTimeAgo, calculateScore, getExplorerLink
  };
};