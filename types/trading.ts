// === TOKEN TYPES ===
export interface TokenData {
    address: string;
    symbol: string;
    name?: string;
    logoURI?: string;
    price: number;
    liquidity: number;
    fdv?: number;
    mc?: number;
    ageMinutes?: number;
    ageHours?: number;
    
    // === PRICE CHANGES (Multiple Timeframes) ===
    priceChange1m?: number;     // 1-minute (from BirdEye)
    priceChange5m: number;      // 5-minute
    priceChange15m?: number;    // 15-minute (approximated from 30m)
    priceChange30m?: number;    // 30-minute (from BirdEye)
    priceChange1h: number;      // 1-hour
    priceChange24h?: number;    // 24-hour
    
    // === VOLUME (Multiple Timeframes) ===
    volume1m?: number;          // 1-minute volume
    volume5m: number;           // 5-minute volume
    volume15m?: number;         // 15-minute volume
    volume30m?: number;         // 30-minute volume
    volume1h: number;           // 1-hour volume
    volume24h?: number;         // 24-hour volume
    
    // === TRANSACTIONS (Multiple Timeframes) ===
    txns1m?: {                  // 1-minute transactions
      buys: number;
      sells: number;
    };
    txns5m: {                   // 5-minute transactions
      buys: number;
      sells: number;
    };
    txns15m?: {                 // 15-minute transactions
      buys: number;
      sells: number;
    };
    txns30m?: {                 // 30-minute transactions
      buys: number;
      sells: number;
    };
    txns1h: {                   // 1-hour transactions
      buys: number;
      sells: number;
    };
    
    // === DERIVED METRICS (Calculated) ===
    priceVelocity1m?: number;   // Rate of price change per minute
    txnVelocity1m?: number;     // Transactions per minute (from 1m data)
    txnVelocity5m?: number;     // Transactions per minute (from 5m data)
    volumeAcceleration?: number; // Is volume speeding up?
    buyPressure1m?: number;     // Buy ratio in last 1m (0-1)
    buyPressure5m?: number;     // Buy ratio in last 5m (0-1)
    
    // === METADATA ===
    pairCreatedAt?: number;
    source?: string;
    isNewborn?: boolean;
    isHighVolume?: boolean;
    lastUpdated?: number;
    dataQuality?: 'full' | 'partial' | 'dexscreener-only';
    holder?: number;            // Holder count
    decimals?: number;
  }
  
  export interface VerifiedToken extends TokenData {
    score: number;
    signal: 'BUY' | 'WAIT' | 'AVOID';
    scoreReasons: string[];
    tokenType: 'newborn' | 'established' | 'reject';
    scoreHistory?: { score: number; time: number }[];
    verifiedAt?: number;
    discoveredAt?: number;
    rejectReason?: string;
    maxSafePosition?: number;   // Recommended max position size in USD
    confidence?: 'high' | 'medium' | 'low';
  }
  
  // === TRADE TYPES ===
  export interface Trade {
    id: string;
    address: string;
    symbol: string;
    name?: string;
    logoURI?: string;
    entryPrice: number;
    amount: number;
    timestamp: number;
    status: 'OPEN' | 'CLOSED';
    tokenType?: 'newborn' | 'established';
    
    // Live data
    currentPrice?: number;
    currentValue?: number;
    pnl?: number;
    pnlPercent?: number;
    priceChange1m?: number;
    priceChange5m?: number;
    priceChange1h?: number;
    txns1m?: { buys: number; sells: number };
    txns5m?: { buys: number; sells: number };
    holdTimeSeconds?: number;
    
    // Exit data
    exitPrice?: number;
    closedAt?: number;
    exitReason?: string;
  }
  
  // === SETTINGS TYPES ===
  export interface NewbornSettings {
    maxAgeMinutes: number;
    minLiquidity: number;
    maxLiquidity: number;
    minTxns5m: number;
  }
  
  export interface EstablishedSettings {
    minLiquidity: number;
    maxLiquidity: number;
    minTxns1h: number;
    minVolume1h: number;
  }
  
  export interface ScoringWeights {
    priceChange5m: number;
    buyPressure5m: number;
    buyPressure1h: number;
    volumeSpike: number;
    liquidityHealth: number;
    freshnessBonus: number;
  }
  
  export interface ScoringThresholds {
    strongMomentum5m: number;
    goodMomentum5m: number;
    minMomentum5m: number;
    strongBuyRatio: number;
    goodBuyRatio: number;
    volumeSpikeMultiplier: number;
  }
  
  export interface ScaledTakeProfit {
    tp1Percent: number;
    tp1Size: number;
    tp2Percent: number;
    tp2Size: number;
  }
  
  export interface BotSettings {
    buyAmount: number;
    takeProfit: number;
    stopLoss: number;
    maxPositions: number;
    minScore: number;
    newborn: NewbornSettings;
    established: EstablishedSettings;
    weights: ScoringWeights;
    thresholds: ScoringThresholds;
    
    // Memecoin-specific settings
    maxHoldTimeSeconds?: number;
    useShortTimeframes?: boolean;
    scaledTakeProfit?: ScaledTakeProfit;
  }
  
  // === SCORING RESULT ===
  export interface ScoringResult {
    score: number;
    signal: 'BUY' | 'WAIT' | 'AVOID';
    reasons: string[];
    tokenType: 'newborn' | 'established' | 'reject';
    maxSafePosition?: number;
    confidence?: 'high' | 'medium' | 'low';
  }
  
  // === SCORING ENGINE INTERFACE ===
  export interface ScoringEngine {
    name: string;
    version: string;
    description: string;
    
    classify: (token: TokenData, settings: BotSettings) => 'newborn' | 'established' | 'reject';
    calculateScore: (token: TokenData, settings: BotSettings) => ScoringResult;
  }
  
  // === STATS ===
  export interface BotStats {
    totalDiscovered: number;
    totalChecked: number;
    totalVerified: number;
    totalRejected: number;
    totalBought: number;
    newbornFound: number;
    establishedFound: number;
    scoringCycles: number;
    lastScoringTime: number;
    birdeyeCallsUsed?: number;
    dataQuality?: 'full' | 'partial' | 'dexscreener-only';
  }
  
  export interface HistoryStats {
    realizedPnL: number;
    winRate: number;
    avgReturn: number;
    totalTrades: number;
    avgHoldTime?: number;
  }
  
  // === BIRDEYE API TYPES ===
  export interface BirdEyeTokenData {
    address: string;
    timestamp: number;
    price: number;
    
    // 1m
    priceChange1m: number;
    volume1m: number;
    buys1m: number;
    sells1m: number;
    trades1m: number;
    
    // 5m
    priceChange5m: number;
    volume5m: number;
    buys5m: number;
    sells5m: number;
    trades5m: number;
    
    // 30m
    priceChange30m: number;
    volume30m: number;
    buys30m: number;
    sells30m: number;
    trades30m: number;
    
    // 1h
    priceChange1h: number;
    volume1h: number;
    buys1h: number;
    sells1h: number;
    trades1h: number;
    
    // 24h
    priceChange24h: number;
    volume24h: number;
    
    // Meta
    liquidity: number;
    symbol: string;
    name: string;
    mc: number;
    fdv: number;
    holder: number;
    createdAt: number | null;
  }
  
  // === QUEUE TYPES ===
  export interface QueueItem {
    address: string;
    priority: 'critical' | 'high' | 'normal' | 'low';
    callback: (data: BirdEyeTokenData | null) => void;
    addedAt: number;
  }
  
  export interface QueueStats {
    queueLength: number;
    cacheSize: number;
    totalRequests: number;
    failedRequests: number;
    isProcessing: boolean;
    requestsThisSecond: number;
  }