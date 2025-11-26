// === TOKEN TYPES ===
export interface TokenData {
    address: string;
    symbol: string;
    name?: string;
    logoURI?: string;
    price: number;
    liquidity: number;
    fdv?: number;
    ageMinutes?: number;
    ageHours?: number;
    priceChange5m: number;
    priceChange1h: number;
    volume5m: number;
    volume1h: number;
    txns5m: {
      buys: number;
      sells: number;
    };
    txns1h: {
      buys: number;
      sells: number;
    };
    pairCreatedAt?: number;
    source?: string;
    isNewborn?: boolean;
    isHighVolume?: boolean;
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
    priceChange5m?: number;
    priceChange1h?: number;
    txns5m?: { buys: number; sells: number };
    
    // Exit data
    exitPrice?: number;
    closedAt?: number;
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
  }
  
  // === SCORING RESULT ===
  export interface ScoringResult {
    score: number;
    signal: 'BUY' | 'WAIT' | 'AVOID';
    reasons: string[];
    tokenType: 'newborn' | 'established' | 'reject';
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
  }
  
  export interface HistoryStats {
    realizedPnL: number;
    winRate: number;
    avgReturn: number;
    totalTrades: number;
  }