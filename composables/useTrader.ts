import { ref, computed, watch } from "vue";
import type {
  TokenData,
  VerifiedToken,
  Trade,
  BotSettings,
  BotStats,
} from "~/types/trading";
import { useScoringEngine } from "./useScoringEngine";

// === GLOBAL STATE ===
const discoveryQueue = ref<TokenData[]>([]);
const verifiedTokens = ref<VerifiedToken[]>([]);
const rejectedTokens = ref<VerifiedToken[]>([]);
const activeTrades = ref<Trade[]>([]);
const tradeHistory = ref<Trade[]>([]);

// === CACHES & INTERNALS ===
const checkedCache = ref<Map<string, number>>(new Map());
const CACHE_TTL_MS = 2 * 60 * 1000;
const VERIFIED_MAX_AGE_MS = 8 * 60 * 1000;
const MAX_VERIFIED_POOL = 80;
const MAX_DISCOVERY_QUEUE = 500;

// === BOT SETTINGS ===
const isAutoTrading = ref(false);
const botSettings = ref<BotSettings>({
  buyAmount: 20,
  takeProfit: 3,
  stopLoss: 2,
  maxPositions: 5,
  minScore: 65,

  newborn: {
    maxAgeMinutes: 120,
    minLiquidity: 1000,
    maxLiquidity: 50000,
    minTxns5m: 1,
  },
  established: {
    minLiquidity: 20000,
    maxLiquidity: 2000000,
    minTxns1h: 50,
    minVolume1h: 5000,
  },

  weights: {
    priceChange5m: 40,
    buyPressure5m: 25,
    buyPressure1h: 15,
    volumeSpike: 10,
    liquidityHealth: 5,
    freshnessBonus: 5,
  },

  thresholds: {
    strongMomentum5m: 3,
    goodMomentum5m: 1,
    minMomentum5m: 0.3,
    strongBuyRatio: 1.3,
    goodBuyRatio: 1.1,
    volumeSpikeMultiplier: 1.5,
  },
});
const botLogs = ref<string[]>([]);

// === UI STATES ===
const isSieveRunning = ref(false);
const isScoringRunning = ref(false);
const currentChecking = ref<string>("Idle");
const showBuyModal = ref(false);
const showSettingsModal = ref(false);
const selectedToken = ref<VerifiedToken | null>(null);
const buyAmount = ref(10);
const isBuying = ref(false);

// === STATS ===
const stats = ref<BotStats>({
  totalDiscovered: 0,
  totalChecked: 0,
  totalVerified: 0,
  totalRejected: 0,
  totalBought: 0,
  newbornFound: 0,
  establishedFound: 0,
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
  // === SCORING ENGINE ===
  const {
    classify,
    calculateScore,
    engineName,
    engineVersion,
    availableEngines,
    setEngine,
    currentEngineName,
    saveEnginePreference,
  } = useScoringEngine();

  // === LOGGING ===
  const log = (
    msg: string,
    type:
      | "info"
      | "success"
      | "error"
      | "warn"
      | "trade"
      | "scan"
      | "score"
      | "newborn" = "info"
  ) => {
    const time = new Date().toLocaleTimeString();
    const prefix = {
      success: "✅",
      error: "❌",
      warn: "⚠️",
      trade: "💰",
      scan: "📡",
      score: "🎯",
      info: "ℹ️",
      newborn: "🐣",
    }[type];
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
    const ts =
      typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  const getExplorerLink = (address: string) =>
    `https://birdeye.so/token/${address}?chain=solana`;

  // === COMPUTED ===
  const totalPortfolioValue = computed(() => {
    return activeTrades.value.reduce((acc, t) => {
      const val = t.currentPrice
        ? (t.amount / t.entryPrice) * t.currentPrice
        : t.amount;
      return acc + val;
    }, 0);
  });

  const totalPnL = computed(() => {
    const invested = activeTrades.value.reduce((acc, t) => acc + t.amount, 0);
    return totalPortfolioValue.value - invested;
  });

  const historyStats = computed(() => {
    const closed = tradeHistory.value || [];
    if (closed.length === 0)
      return { realizedPnL: 0, winRate: 0, avgReturn: 0, totalTrades: 0 };

    const realizedPnL = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
    const winRate = (wins / closed.length) * 100;
    const avgReturn =
      closed.reduce((acc, t) => {
        if (!t.exitPrice || !t.entryPrice) return acc;
        return acc + (((t.exitPrice - t.entryPrice) / t.entryPrice) * 100);
      }, 0) / closed.length;

    return { realizedPnL, winRate, avgReturn, totalTrades: closed.length };
  });

  // === DATA FETCHING ===
  const fetchBatchTokenData = async (
    addresses: string[]
  ): Promise<Record<string, TokenData>> => {
    if (addresses.length === 0) return {};
    const results: Record<string, TokenData> = {};
    const chunkSize = 30;

    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      try {
        const response = await fetch(
          `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`,
          { headers: { Accept: "application/json" } }
        );
        const pairs = await response.json();

        if (Array.isArray(pairs)) {
          const tokenMap: Record<string, any> = {};
          for (const pair of pairs) {
            const addr = pair.baseToken?.address;
            if (!addr) continue;
            const liq = pair.liquidity?.usd || 0;
            if (!tokenMap[addr] || liq > (tokenMap[addr].liquidity?.usd || 0)) {
              tokenMap[addr] = pair;
            }
          }

          for (const [addr, pair] of Object.entries(tokenMap)) {
            const ageMs = pair.pairCreatedAt
              ? Date.now() - pair.pairCreatedAt
              : Infinity;
            results[addr] = {
              address: addr,
              symbol: pair.baseToken?.symbol || "UNK",
              name: pair.baseToken?.name,
              price: parseFloat(pair.priceUsd) || 0,
              liquidity: pair.liquidity?.usd || 0,
              fdv: pair.fdv || 0,
              ageMinutes: Math.round(ageMs / 60000),
              ageHours: Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10,
              priceChange5m: pair.priceChange?.m5 || 0,
              priceChange1h: pair.priceChange?.h1 || 0,
              volume5m: pair.volume?.m5 || 0,
              volume1h: pair.volume?.h1 || 0,
              txns5m: pair.txns?.m5 || { buys: 0, sells: 0 },
              txns1h: pair.txns?.h1 || { buys: 0, sells: 0 },
              pairCreatedAt: pair.pairCreatedAt,
            };
          }
        }
      } catch (e) {
        console.error("Batch fetch error:", e);
      }
    }
    return results;
  };

  // === DISCOVERY ===
  const runDiscovery = async () => {
    try {
      const res = await fetch("/api/hunter?type=auto");
      const json = await res.json();

      if (json.success && json.data?.items) {
        const now = Date.now();
        let addedCount = 0;
        let newbornCount = 0;
        let establishedCount = 0;

        for (const token of json.data.items) {
          if (!token.address) continue;
          if (checkedCache.value.get(token.address)) continue;
          if (verifiedTokens.value.some((v) => v.address === token.address))
            continue;
          if (discoveryQueue.value.some((d) => d.address === token.address))
            continue;
          if (activeTrades.value.some((t) => t.address === token.address))
            continue;

          if (token.isNewborn || token.source === "newborn") newbornCount++;
          if (token.isHighVolume || token.source === "highVolume")
            establishedCount++;

          discoveryQueue.value.push({
            ...token,
            discoveredAt: now,
          } as TokenData);
          addedCount++;
          stats.value.totalDiscovered++;
        }

        if (discoveryQueue.value.length > MAX_DISCOVERY_QUEUE) {
          discoveryQueue.value = discoveryQueue.value.slice(-MAX_DISCOVERY_QUEUE);
        }

        if (addedCount > 0) {
          const sourceInfo = [];
          if (newbornCount > 0) sourceInfo.push(`${newbornCount} newborn`);
          if (establishedCount > 0)
            sourceInfo.push(`${establishedCount} active`);
          log(
            `${json.source}: +${addedCount} (${sourceInfo.join(", ") || "mixed"})`,
            "scan"
          );
        }
      }
    } catch (e) {
      console.error("Discovery error:", e);
    }
  };

  // === SIEVE ===
  const processSieveItem = async () => {
    if (discoveryQueue.value.length === 0) {
      currentChecking.value = "Queue empty...";
      return;
    }

    const token = discoveryQueue.value.shift()!;
    const now = Date.now();
    checkedCache.value.set(token.address, now);
    stats.value.totalChecked++;
    currentChecking.value = `Checking: ${token.symbol}`;

    try {
      const data = await fetchBatchTokenData([token.address]);
      const freshData = data[token.address];

      if (!freshData || !freshData.price) {
        const rejected: VerifiedToken = {
          ...token,
          score: 0,
          signal: "AVOID",
          scoreReasons: [],
          tokenType: "reject",
          rejectReason: "No data",
        };
        rejectedTokens.value.unshift(rejected);
        return;
      }

      const enrichedToken: TokenData = { ...token, ...freshData };

      // Use scoring engine to classify
      const tokenType = classify(enrichedToken, botSettings.value);

      if (tokenType === "reject") {
        const ageMinutes = enrichedToken.ageMinutes || 0;
        const txns1h =
          (enrichedToken.txns1h?.buys || 0) +
          (enrichedToken.txns1h?.sells || 0);

        let rejectReason: string;
        if (
          ageMinutes > botSettings.value.newborn.maxAgeMinutes &&
          txns1h < botSettings.value.established.minTxns1h
        ) {
          rejectReason = `Dead coin: ${ageMinutes}m old, only ${txns1h} txns/h`;
        } else if (ageMinutes <= botSettings.value.newborn.maxAgeMinutes) {
          rejectReason = `Newborn but dead: no activity`;
        } else {
          rejectReason = `Low activity: ${txns1h} txns/h`;
        }

        const rejected: VerifiedToken = {
          ...enrichedToken,
          score: 0,
          signal: "AVOID",
          scoreReasons: [],
          tokenType: "reject",
          rejectReason,
        };
        rejectedTokens.value.unshift(rejected);
        stats.value.totalRejected++;
        return;
      }

      // Quick reject if 5m is negative
      if (enrichedToken.priceChange5m < -1) {
        const rejected: VerifiedToken = {
          ...enrichedToken,
          score: 0,
          signal: "AVOID",
          scoreReasons: [],
          tokenType,
          rejectReason: `Negative 5m: ${enrichedToken.priceChange5m.toFixed(1)}%`,
        };
        rejectedTokens.value.unshift(rejected);
        return;
      }

      // Use scoring engine to calculate score
      const { score, signal, reasons } = calculateScore(
        enrichedToken,
        botSettings.value
      );

      const verified: VerifiedToken = {
        ...enrichedToken,
        score,
        signal,
        scoreReasons: reasons,
        tokenType,
        scoreHistory: [{ score, time: now }],
        verifiedAt: now,
      };

      verifiedTokens.value.unshift(verified);
      stats.value.totalVerified++;

      if (tokenType === "newborn") stats.value.newbornFound++;
      else stats.value.establishedFound++;

      if (verifiedTokens.value.length > MAX_VERIFIED_POOL) {
        verifiedTokens.value = verifiedTokens.value.slice(0, MAX_VERIFIED_POOL);
      }

      const txns5m =
        (enrichedToken.txns5m?.buys || 0) + (enrichedToken.txns5m?.sells || 0);
      const typeEmoji = tokenType === "newborn" ? "🐣" : "📈";
      log(
        `${typeEmoji} ${enrichedToken.symbol} | Score: ${score} | 5m: ${enrichedToken.priceChange5m > 0 ? "+" : ""}${enrichedToken.priceChange5m?.toFixed(1)}% | ${txns5m} txns`,
        "success"
      );
    } catch (e) {
      const rejected: VerifiedToken = {
        ...token,
        score: 0,
        signal: "AVOID",
        scoreReasons: [],
        tokenType: "reject",
        rejectReason: "Error",
      };
      rejectedTokens.value.unshift(rejected);
    }
  };

  // === BATCH SCORING ===
  const runBatchScoring = async () => {
    if (
      !isAutoTrading.value ||
      verifiedTokens.value.length === 0 ||
      isScoringRunning.value
    )
      return;
    isScoringRunning.value = true;
    const startTime = Date.now();

    try {
      const addresses = verifiedTokens.value.map((t) => t.address);
      currentChecking.value = `Scoring ${addresses.length} tokens...`;
      const freshData = await fetchBatchTokenData(addresses);
      const buySignals: VerifiedToken[] = [];
      const tokensToRemove: string[] = [];

      for (const token of verifiedTokens.value) {
        const data = freshData[token.address];
        if (!data) continue;

        // Update token with fresh data
        Object.assign(token, data);

        // Use scoring engine
        const { score, signal, reasons, tokenType } = calculateScore(
          token,
          botSettings.value
        );
        token.score = score;
        token.signal = signal;
        token.scoreReasons = reasons;
        token.tokenType = tokenType;

        if (token.scoreHistory) {
          token.scoreHistory.unshift({ score, time: Date.now() });
          if (token.scoreHistory.length > 10) token.scoreHistory.pop();
        }

        // Check for BUY signal
        if (signal === "BUY" && score >= botSettings.value.minScore) {
          const canBuy =
            activeTrades.value.length < botSettings.value.maxPositions;
          const notHeld = !activeTrades.value.some(
            (t) => t.address === token.address
          );
          if (canBuy && notHeld) buySignals.push(token);
        }

        // Remove dead or bad tokens
        if (tokenType === "reject" || score < 20 || token.priceChange5m < -3) {
          tokensToRemove.push(token.address);
        }
      }

      // Execute best opportunities first
      buySignals.sort((a, b) => b.score - a.score);

      for (const token of buySignals) {
        if (activeTrades.value.length >= botSettings.value.maxPositions) break;
        const typeEmoji = token.tokenType === "newborn" ? "🐣" : "📈";
        log(
          `🎯 ${typeEmoji} SCALP: ${token.symbol} | Score: ${token.score} | 5m: +${token.priceChange5m?.toFixed(1)}%`,
          "score"
        );
        await executeTradeAction(token, botSettings.value.buyAmount, true);
        tokensToRemove.push(token.address);
      }

      if (tokensToRemove.length > 0) {
        verifiedTokens.value = verifiedTokens.value.filter(
          (t) => !tokensToRemove.includes(t.address)
        );
      }

      stats.value.scoringCycles++;
      stats.value.lastScoringTime = Date.now() - startTime;
    } catch (e) {
      console.error("Batch scoring error", e);
    } finally {
      isScoringRunning.value = false;
      currentChecking.value = `Scored ${verifiedTokens.value.length} tokens`;
    }
  };

  // === TRADE EXECUTION ===
  const executeTradeAction = async (
    token: VerifiedToken,
    amount: number,
    isAuto: boolean
  ) => {
    try {
      const safePrice = Number(token.price) || 0.000001;
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          token: { ...token, price: safePrice },
          amount,
        }),
      });
      const result = await res.json();

      if (result.success) {
        await fetchPortfolio();
        stats.value.totalBought++;
        const typeEmoji = token.tokenType === "newborn" ? "🐣" : "📈";
        if (isAuto) {
          log(
            `${typeEmoji} BUY: $${amount} ${token.symbol} @ $${formatPrice(safePrice)}`,
            "trade"
          );
        } else {
          showBuyModal.value = false;
          log(`MANUAL BUY: $${amount} ${token.symbol}`, "trade");
        }
        return true;
      }
      return false;
    } catch (e) {
      log(`Trade failed: ${token.symbol}`, "error");
      return false;
    }
  };

  const closePosition = async (trade: Trade, reason: string = "Manual Close") => {
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          tradeId: trade.id,
          currentPrice: trade.currentPrice,
        }),
      });
      const result = await res.json();

      if (result.success) {
        await fetchPortfolio();
        const pnlPct = trade.pnlPercent || 0;
        log(
          `SELL: ${trade.symbol} | ${reason} | ${pnlPct.toFixed(2)}%`,
          pnlPct >= 0 ? "success" : "warn"
        );
      }
    } catch (e) {
      console.error("Close error", e);
    }
  };

  const removeFromVerified = (address: string) => {
    const token = verifiedTokens.value.find((t) => t.address === address);
    verifiedTokens.value = verifiedTokens.value.filter(
      (t) => t.address !== address
    );
    if (token) {
      log(`Removed ${token.symbol} from watchlist`, "info");
    }
  };

  // === PORTFOLIO MANAGEMENT ===
  const refreshPortfolioPrices = async () => {
    if (activeTrades.value.length === 0) return;

    try {
      const addresses = activeTrades.value.map((t) => t.address);
      const freshData = await fetchBatchTokenData(addresses);
      const toClose: { trade: Trade; reason: string }[] = [];

      activeTrades.value.forEach((trade) => {
        const data = freshData[trade.address];
        if (data?.price) {
          trade.currentPrice = data.price;
          trade.currentValue =
            (trade.amount / trade.entryPrice) * trade.currentPrice;
          trade.pnl = trade.currentValue - trade.amount;
          trade.pnlPercent =
            ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
          trade.priceChange5m = data.priceChange5m;
          trade.priceChange1h = data.priceChange1h;
          trade.txns5m = data.txns5m;

          if (isAutoTrading.value) {
            // TAKE PROFIT
            if (trade.pnlPercent >= botSettings.value.takeProfit) {
              toClose.push({
                trade,
                reason: `TP +${trade.pnlPercent.toFixed(1)}%`,
              });
            }
            // STOP LOSS
            else if (trade.pnlPercent <= -botSettings.value.stopLoss) {
              toClose.push({
                trade,
                reason: `SL ${trade.pnlPercent.toFixed(1)}%`,
              });
            }
            // MOMENTUM EXIT
            else if (trade.priceChange5m < -2 && trade.pnlPercent < 0) {
              toClose.push({
                trade,
                reason: `Momentum exit: 5m ${trade.priceChange5m.toFixed(1)}%`,
              });
            }
            // SELL PRESSURE EXIT
            else if (
              trade.txns5m &&
              trade.txns5m.sells > trade.txns5m.buys * 2 &&
              trade.pnlPercent < 1
            ) {
              toClose.push({ trade, reason: `Sell pressure detected` });
            }
          }
        }
      });

      for (const { trade, reason } of toClose) {
        await closePosition(trade, reason);
      }
    } catch (e) {
      console.error("Refresh portfolio error", e);
    }
  };

  const fetchPortfolio = async () => {
    try {
      const res = await fetch("/api/portfolio");
      const json = await res.json();

      activeTrades.value = (json.trades || []).map((t: any) => ({
        ...t,
        currentPrice: t.entryPrice,
        pnl: 0,
        pnlPercent: 0,
        currentValue: t.amount,
      }));

      tradeHistory.value = json.history || [];

      if (activeTrades.value.length > 0) await refreshPortfolioPrices();
    } catch (e) {
      console.error("Fetch portfolio error:", e);
    }
  };

  const runCleanup = () => {
    const now = Date.now();

    for (const [addr, time] of checkedCache.value.entries()) {
      if (now - time > CACHE_TTL_MS) checkedCache.value.delete(addr);
    }

    verifiedTokens.value = verifiedTokens.value.filter(
      (t) => now - (t.verifiedAt || 0) < VERIFIED_MAX_AGE_MS
    );

    if (rejectedTokens.value.length > 100) {
      rejectedTokens.value = rejectedTokens.value.slice(0, 100);
    }
  };

  // === BOT CONTROLS ===
  const startBot = () => {
    if (isAutoTrading.value) return;
    isAutoTrading.value = true;
    stats.value.scoringCycles = 0;
    stats.value.newbornFound = 0;
    stats.value.establishedFound = 0;
    log(
      `🤖 SCALP BOT STARTED [${engineName.value} v${engineVersion.value}]`,
      "success"
    );

    fetchPortfolio();
    runDiscovery();

    discoveryTimer = setInterval(runDiscovery, 10000);

    isSieveRunning.value = true;
    const sieveLoop = async () => {
      if (!isAutoTrading.value) return;
      await processSieveItem();
      sieveTimer = setTimeout(sieveLoop, 200);
    };
    sieveLoop();

    scoringTimer = setInterval(runBatchScoring, 2000);
    setTimeout(runBatchScoring, 1500);

    portfolioTimer = setInterval(refreshPortfolioPrices, 3000);
    cleanupTimer = setInterval(runCleanup, 30000);
  };

  const StopBot = () => {
    isAutoTrading.value = false;
    isSieveRunning.value = false;
    currentChecking.value = "Stopped";
    log("🛑 SCALP BOT STOPPED", "warn");

    if (discoveryTimer) clearInterval(discoveryTimer);
    if (sieveTimer) clearTimeout(sieveTimer);
    if (scoringTimer) clearInterval(scoringTimer);
    if (portfolioTimer) clearInterval(portfolioTimer);
    if (cleanupTimer) clearInterval(cleanupTimer);
  };

  const openBuyModal = (token: VerifiedToken) => {
    selectedToken.value = { ...token };
    showBuyModal.value = true;
  };

  const executeBuy = async () => {
    if (!selectedToken.value) return;
    isBuying.value = true;
    await executeTradeAction(selectedToken.value, buyAmount.value, false);
    isBuying.value = false;
  };

  const openSettingsModal = () => {
    showSettingsModal.value = true;
  };

  const closeSettingsModal = () => {
    showSettingsModal.value = false;
  };

  // === CHANGE SCORING ENGINE ===
  const changeScoringEngine = (engineId: string) => {
    const success = setEngine(engineId);
    if (success) {
      saveEnginePreference();
      log(`Switched to scoring engine: ${engineName.value}`, "info");
    }
  };

  // === PERSIST SETTINGS ===
  watch(
    botSettings,
    () => {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "alex_bot_settings_v2",
          JSON.stringify(botSettings.value)
        );
      }
    },
    { deep: true }
  );

  // === LOAD SETTINGS ===
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("alex_bot_settings_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach((key) => {
          if (typeof parsed[key] === "object" && parsed[key] !== null) {
            Object.assign((botSettings.value as any)[key], parsed[key]);
          } else {
            (botSettings.value as any)[key] = parsed[key];
          }
        });
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }
  }

  return {
    // State
    isAutoTrading,
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
    rejectedTokens,
    showBuyModal,
    showSettingsModal,
    selectedToken,
    buyAmount,
    isBuying,
    stats,
    isScoringRunning,
    isSieveRunning,

    // Scoring Engine
    engineName,
    engineVersion,
    availableEngines,
    currentEngineName,
    changeScoringEngine,

    // Actions
    startBot,
    StopBot,
    refreshPortfolioPrices,
    fetchPortfolio,
    closePosition,
    openBuyModal,
    executeBuy,
    removeFromVerified,
    openSettingsModal,
    closeSettingsModal,

    // Utilities
    formatVal,
    formatPrice,
    formatTimeAgo,
    getExplorerLink,
};
};