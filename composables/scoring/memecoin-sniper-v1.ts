/**
 * MEMECOIN SNIPER V1 SCORING ENGINE
 * 
 * Philosophy: Survive and profit in the chaos of Solana memecoins.
 * Now with 1-minute data for faster, more accurate signals.
 * 
 * ═══════════════════════════════════════════════════════════════
 * KEY PRINCIPLES
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1. HARD BLOCKERS - Instant rejection, no score calculation
 * 2. 1-MINUTE IS PRIMARY - 5m/1h are confirmation only
 * 3. VELOCITY > DIRECTION - Rate of change matters more than current state
 * 4. VOLUME/LIQUIDITY GATES - Strict thresholds for safety
 * 5. ACCELERATION DETECTION - Is momentum building or fading?
 * 6. PRESSURE DELTA - Compare 1m vs 5m to detect shifts
 * 7. NO NEWBORN BIAS - New tokens are sniper traps
 * 
 * ═══════════════════════════════════════════════════════════════
 * DATA USAGE
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1-MINUTE DATA (Primary Signals):
 * - priceChange1m: Immediate momentum
 * - txns1m: Real-time activity
 * - volume1m: Current interest
 * - buyPressure1m: Who's in control RIGHT NOW
 * 
 * 5-MINUTE DATA (Confirmation):
 * - priceChange5m: Short-term trend
 * - txns5m: Sustained activity
 * - volume5m: Confirmed interest
 * - buyPressure5m: Trend direction
 * 
 * 30M/1H DATA (Context & Safety):
 * - Used for trend context
 * - Volume baseline calculations
 * - Liquidity health checks
 * 
 * ═══════════════════════════════════════════════════════════════
 */

import type { 
    TokenData, 
    BotSettings, 
    ScoringResult, 
    ScoringEngine 
  } from '~/types/trading';
  
  // ═══════════════════════════════════════════════════════════════
  // HARD BLOCKER THRESHOLDS
  // If ANY trigger, instant AVOID - no scoring needed
  // ═══════════════════════════════════════════════════════════════
  
  const HARD_BLOCKERS = {
    // === LIQUIDITY GATES ===
    minLiquidityUSD: 5000,              // Below $5k = can't trade safely
    maxVolumeToLiqRatio1m: 0.10,        // 1m vol > 10% of liq = WAY too hot
    maxVolumeToLiqRatio5m: 0.30,        // 5m vol > 30% of liq = overheated
    
    // === MOMENTUM GATES ===
    maxNegative1m: -2,                  // -2% in 1m = falling knife
    maxNegative5m: -5,                  // -5% in 5m = dump confirmed
    parabolicThreshold1m: 8,            // +8% in 1m = parabolic (reversal imminent)
    parabolicThreshold5m: 20,           // +20% in 5m = extreme parabolic
    
    // === ACTIVITY GATES ===
    minTxns1m: 1,                       // At least 1 txn in last minute
    minTxns5m: 3,                       // At least 3 txns in last 5 mins
    
    // === SELL PRESSURE GATES ===
    maxSellRatio1m: 0.75,               // If 75%+ of 1m txns are sells = dump
    maxSellRatio5m: 0.70,               // If 70%+ of 5m txns are sells = sustained dump
    
    // === NEWBORN DANGER ZONE ===
    newbornDangerMinutes: 5,            // First 5 mins are pure sniper territory
    newbornMinLiquidity: 10000,         // Newborns need MORE liquidity, not less
    newbornMinTxns: 5,                  // Newborns must have proven activity
  };
  
  // ═══════════════════════════════════════════════════════════════
  // SCORING WEIGHTS (Total: 100)
  // Heavy emphasis on 1-minute data
  // ═══════════════════════════════════════════════════════════════
  
  const WEIGHTS = {
    // PRIMARY (1m data) - 55 points
    momentum1m: 25,              // 1-minute price momentum
    buyPressure1m: 20,           // 1-minute buy/sell ratio
    txnVelocity1m: 10,           // Transactions per minute
    
    // CONFIRMATION (5m data) - 30 points
    momentum5m: 12,              // 5-minute trend confirmation
    buyPressure5m: 10,           // 5-minute buy/sell trend
    volumeHealth: 8,             // Volume vs liquidity ratio
    
    // SAFETY & CONTEXT - 15 points
    liquiditySafety: 8,          // Can we exit?
    pressureAcceleration: 7,     // Is pressure building or fading?
  };
  
  // ═══════════════════════════════════════════════════════════════
  // TYPES
  // ═══════════════════════════════════════════════════════════════
  
  interface HardBlockerResult {
    blocked: boolean;
    reason: string | null;
    severity: 'critical' | 'high' | 'medium' | null;
  }
  
  interface MemeMetrics {
    // === 1-MINUTE METRICS (Primary) ===
    priceChange1m: number;
    txnVelocity1m: number;           // Txns in last minute
    buyRatio1m: number;              // 0-1, buys / total
    sellRatio1m: number;             // 0-1, sells / total
    volume1m: number;
    volumeToLiq1m: number;           // 1m volume / liquidity
    
    // === 5-MINUTE METRICS (Confirmation) ===
    priceChange5m: number;
    txnVelocity5m: number;           // Txns per minute (from 5m)
    buyRatio5m: number;
    sellRatio5m: number;
    volume5m: number;
    volumeToLiq5m: number;
    
    // === ACCELERATION / DELTA METRICS ===
    pressureDelta: number;           // buyRatio1m - buyRatio5m (positive = building)
    momentumDelta: number;           // priceChange1m - (priceChange5m/5) 
    volumeAcceleration: number;      // volume1m / (volume5m/5) - is volume spiking?
    
    // === LIQUIDITY METRICS ===
    liquidityUSD: number;
    liquidityScore: number;          // 0-1
    maxSafePositionUSD: number;
    
    // === RISK FLAGS ===
    isParabolic1m: boolean;
    isParabolic5m: boolean;
    isFallingKnife: boolean;
    isDump1m: boolean;
    isDump5m: boolean;
    isOverheated1m: boolean;
    isOverheated5m: boolean;
    isPressureFading: boolean;
    isMomentumFading: boolean;
    isNewbornDanger: boolean;
    
    // === SIGNAL FLAGS ===
    isPressureBuilding: boolean;
    isMomentumBuilding: boolean;
    isVolumeSpike: boolean;
    hasStrongBuying1m: boolean;
    hasStrongBuying5m: boolean;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // HARD BLOCKER CHECK
  // ═══════════════════════════════════════════════════════════════
  
  function checkHardBlockers(token: TokenData): HardBlockerResult {
    const liq = token.liquidity || 0;
    const vol1m = token.volume1m || 0;
    const vol5m = token.volume5m || 0;
    const change1m = token.priceChange1m ?? 0;
    const change5m = token.priceChange5m ?? 0;
    const buys1m = token.txns1m?.buys || 0;
    const sells1m = token.txns1m?.sells || 0;
    const buys5m = token.txns5m?.buys || 0;
    const sells5m = token.txns5m?.sells || 0;
    const totalTxns1m = buys1m + sells1m;
    const totalTxns5m = buys5m + sells5m;
    const ageMinutes = token.ageMinutes || Infinity;
    
    // === CRITICAL: LIQUIDITY ===
    if (liq < HARD_BLOCKERS.minLiquidityUSD) {
      return { 
        blocked: true, 
        reason: `💀 Liq too low: $${liq.toFixed(0)}`, 
        severity: 'critical' 
      };
    }
    
    // === CRITICAL: 1M VOLUME/LIQUIDITY ===
    const volToLiq1m = liq > 0 ? vol1m / liq : 0;
    if (volToLiq1m > HARD_BLOCKERS.maxVolumeToLiqRatio1m) {
      return { 
        blocked: true, 
        reason: `🔥 1m overheated: ${(volToLiq1m * 100).toFixed(0)}% vol/liq`, 
        severity: 'critical' 
      };
    }
    
    // === CRITICAL: 5M VOLUME/LIQUIDITY ===
    const volToLiq5m = liq > 0 ? vol5m / liq : 0;
    if (volToLiq5m > HARD_BLOCKERS.maxVolumeToLiqRatio5m) {
      return { 
        blocked: true, 
        reason: `🔥 5m overheated: ${(volToLiq5m * 100).toFixed(0)}% vol/liq`, 
        severity: 'critical' 
      };
    }
    
    // === CRITICAL: FALLING KNIFE 1M ===
    if (change1m < HARD_BLOCKERS.maxNegative1m) {
      return { 
        blocked: true, 
        reason: `🔪 1m knife: ${change1m.toFixed(1)}%`, 
        severity: 'critical' 
      };
    }
    
    // === CRITICAL: FALLING KNIFE 5M ===
    if (change5m < HARD_BLOCKERS.maxNegative5m) {
      return { 
        blocked: true, 
        reason: `🔪 5m dump: ${change5m.toFixed(1)}%`, 
        severity: 'critical' 
      };
    }
    
    // === HIGH: PARABOLIC 1M ===
    if (change1m > HARD_BLOCKERS.parabolicThreshold1m) {
      return { 
        blocked: true, 
        reason: `🎢 1m parabolic: +${change1m.toFixed(1)}%`, 
        severity: 'high' 
      };
    }
    
    // === HIGH: PARABOLIC 5M ===
    if (change5m > HARD_BLOCKERS.parabolicThreshold5m) {
      return { 
        blocked: true, 
        reason: `🎢 5m parabolic: +${change5m.toFixed(1)}%`, 
        severity: 'high' 
      };
    }
    
    // === HIGH: DEAD TOKEN ===
    if (totalTxns5m < HARD_BLOCKERS.minTxns5m) {
      return { 
        blocked: true, 
        reason: `💀 Dead: ${totalTxns5m} txns/5m`, 
        severity: 'high' 
      };
    }
    
    // === HIGH: 1M DUMP (Sell Pressure) ===
    if (totalTxns1m >= 2) {
      const sellRatio1m = sells1m / totalTxns1m;
      if (sellRatio1m > HARD_BLOCKERS.maxSellRatio1m) {
        return { 
          blocked: true, 
          reason: `📉 1m dump: ${(sellRatio1m * 100).toFixed(0)}% sells`, 
          severity: 'high' 
        };
      }
    }
    
    // === HIGH: 5M DUMP (Sustained Sell Pressure) ===
    if (totalTxns5m >= 5) {
      const sellRatio5m = sells5m / totalTxns5m;
      if (sellRatio5m > HARD_BLOCKERS.maxSellRatio5m) {
        return { 
          blocked: true, 
          reason: `📉 5m dump: ${(sellRatio5m * 100).toFixed(0)}% sells`, 
          severity: 'high' 
        };
      }
    }
    
    // === MEDIUM: NEWBORN DANGER ZONE ===
    if (ageMinutes <= HARD_BLOCKERS.newbornDangerMinutes) {
      if (liq < HARD_BLOCKERS.newbornMinLiquidity) {
        return { 
          blocked: true, 
          reason: `🎯 Sniper trap: ${ageMinutes}m old, $${liq.toFixed(0)} liq`, 
          severity: 'medium' 
        };
      }
      if (totalTxns5m < HARD_BLOCKERS.newbornMinTxns) {
        return { 
          blocked: true, 
          reason: `🎯 Sniper trap: ${ageMinutes}m old, ${totalTxns5m} txns`, 
          severity: 'medium' 
        };
      }
    }
    
    return { blocked: false, reason: null, severity: null };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CALCULATE METRICS
  // ═══════════════════════════════════════════════════════════════
  
  function calculateMemeMetrics(token: TokenData): MemeMetrics {
    const liq = token.liquidity || 1;
    const ageMinutes = token.ageMinutes || Infinity;
    
    // === EXTRACT RAW DATA ===
    const priceChange1m = token.priceChange1m ?? 0;
    const priceChange5m = token.priceChange5m ?? 0;
    
    const volume1m = token.volume1m || 0;
    const volume5m = token.volume5m || 0;
    
    const buys1m = token.txns1m?.buys || 0;
    const sells1m = token.txns1m?.sells || 0;
    const totalTxns1m = buys1m + sells1m;
    
    const buys5m = token.txns5m?.buys || 0;
    const sells5m = token.txns5m?.sells || 0;
    const totalTxns5m = buys5m + sells5m;
    
    // === 1-MINUTE CALCULATIONS ===
    const txnVelocity1m = totalTxns1m; // Already per minute
    const buyRatio1m = totalTxns1m > 0 ? buys1m / totalTxns1m : 0.5;
    const sellRatio1m = totalTxns1m > 0 ? sells1m / totalTxns1m : 0.5;
    const volumeToLiq1m = volume1m / liq;
    
    // === 5-MINUTE CALCULATIONS ===
    const txnVelocity5m = totalTxns5m / 5; // Per minute average
    const buyRatio5m = totalTxns5m > 0 ? buys5m / totalTxns5m : 0.5;
    const sellRatio5m = totalTxns5m > 0 ? sells5m / totalTxns5m : 0.5;
    const volumeToLiq5m = volume5m / liq;
    
    // === ACCELERATION / DELTA ===
    // Positive = 1m is MORE bullish than 5m average (momentum building)
    // Negative = 1m is LESS bullish than 5m average (momentum fading)
    const pressureDelta = buyRatio1m - buyRatio5m;
    
    // Compare 1m change to average 1m change (from 5m data)
    const avg1mFrom5m = priceChange5m / 5;
    const momentumDelta = priceChange1m - avg1mFrom5m;
    
    // Volume acceleration: is 1m volume higher than average?
    const avgVol1mFrom5m = volume5m / 5;
    const volumeAcceleration = avgVol1mFrom5m > 0 ? volume1m / avgVol1mFrom5m : 1;
    
    // === LIQUIDITY SCORING ===
    let liquidityScore = 0;
    if (liq >= 100000) liquidityScore = 1.0;
    else if (liq >= 50000) liquidityScore = 0.85;
    else if (liq >= 30000) liquidityScore = 0.7;
    else if (liq >= 20000) liquidityScore = 0.55;
    else if (liq >= 10000) liquidityScore = 0.4;
    else if (liq >= 5000) liquidityScore = 0.25;
    else liquidityScore = 0.1;
    
    // Max safe position: 0.5% of liquidity, capped at $50
    const maxSafePositionUSD = Math.min(liq * 0.005, 50);
    
    // === RISK FLAGS ===
    const isParabolic1m = priceChange1m > 6;
    const isParabolic5m = priceChange5m > 15;
    const isFallingKnife = priceChange1m < -1.5 || priceChange5m < -3;
    const isDump1m = sellRatio1m > 0.60 && totalTxns1m >= 2;
    const isDump5m = sellRatio5m > 0.55 && totalTxns5m >= 5;
    const isOverheated1m = volumeToLiq1m > 0.05;
    const isOverheated5m = volumeToLiq5m > 0.15;
    const isPressureFading = pressureDelta < -0.10;
    const isMomentumFading = momentumDelta < -0.5 && priceChange5m > 2;
    const isNewbornDanger = ageMinutes <= 10 && liq < 15000;
    
    // === SIGNAL FLAGS ===
    const isPressureBuilding = pressureDelta > 0.08;
    const isMomentumBuilding = momentumDelta > 0.3 && priceChange1m > 0;
    const isVolumeSpike = volumeAcceleration > 2;
    const hasStrongBuying1m = buyRatio1m >= 0.60 && totalTxns1m >= 2;
    const hasStrongBuying5m = buyRatio5m >= 0.58 && totalTxns5m >= 5;
    
    return {
      // 1m
      priceChange1m,
      txnVelocity1m,
      buyRatio1m,
      sellRatio1m,
      volume1m,
      volumeToLiq1m,
      
      // 5m
      priceChange5m,
      txnVelocity5m,
      buyRatio5m,
      sellRatio5m,
      volume5m,
      volumeToLiq5m,
      
      // Delta/Acceleration
      pressureDelta,
      momentumDelta,
      volumeAcceleration,
      
      // Liquidity
      liquidityUSD: liq,
      liquidityScore,
      maxSafePositionUSD,
      
      // Risk flags
      isParabolic1m,
      isParabolic5m,
      isFallingKnife,
      isDump1m,
      isDump5m,
      isOverheated1m,
      isOverheated5m,
      isPressureFading,
      isMomentumFading,
      isNewbornDanger,
      
      // Signal flags
      isPressureBuilding,
      isMomentumBuilding,
      isVolumeSpike,
      hasStrongBuying1m,
      hasStrongBuying5m,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════
  
  function classify(
    token: TokenData, 
    settings: BotSettings
  ): 'newborn' | 'established' | 'reject' {
    // Check hard blockers first
    const blockerCheck = checkHardBlockers(token);
    if (blockerCheck.blocked) {
      return 'reject';
    }
    
    const ageMinutes = token.ageMinutes || Infinity;
    const liq = token.liquidity || 0;
    const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0);
    const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0);
    const vol1h = token.volume1h || 0;
  
    // NEWBORN: Young but past danger zone, with activity
    if (ageMinutes <= settings.newborn.maxAgeMinutes) {
      // Stricter than settings for newborns
      const minLiq = Math.max(settings.newborn.minLiquidity, 8000);
      const minTxns = Math.max(settings.newborn.minTxns5m, 5);
      
      if (
        liq >= minLiq &&
        liq <= settings.newborn.maxLiquidity &&
        txns5m >= minTxns &&
        ageMinutes > HARD_BLOCKERS.newbornDangerMinutes // Past danger zone
      ) {
        return 'newborn';
      }
      return 'reject';
    }
  
    // ESTABLISHED: Proven activity and liquidity
    if (
      liq >= settings.established.minLiquidity &&
      liq <= settings.established.maxLiquidity &&
      (txns1h >= settings.established.minTxns1h || vol1h >= settings.established.minVolume1h)
    ) {
      return 'established';
    }
  
    return 'reject';
  }
  
  // ═══════════════════════════════════════════════════════════════
  // MAIN SCORING FUNCTION
  // ═══════════════════════════════════════════════════════════════
  
  function calculateScore(
    token: TokenData, 
    settings: BotSettings
  ): ScoringResult {
    const reasons: string[] = [];
    let score = 0;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
  
    // === STEP 1: HARD BLOCKER CHECK ===
    const blockerCheck = checkHardBlockers(token);
    if (blockerCheck.blocked) {
      return { 
        score: 0, 
        signal: 'AVOID', 
        reasons: [blockerCheck.reason || 'Hard blocker triggered'], 
        tokenType: 'reject',
        confidence: 'high',
      };
    }
  
    // === STEP 2: CLASSIFICATION ===
    const tokenType = classify(token, settings);
    
    if (tokenType === 'reject') {
      return { 
        score: 0, 
        signal: 'AVOID', 
        reasons: ['Does not meet criteria'], 
        tokenType: 'reject',
        confidence: 'high',
      };
    }
  
    // === STEP 3: CALCULATE METRICS ===
    const m = calculateMemeMetrics(token);
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 1: 1-MINUTE MOMENTUM (25 points)
    // This is our PRIMARY signal
    // ═══════════════════════════════════════════════════════════
    
    if (m.priceChange1m >= 3 && !m.isParabolic1m) {
      score += 25;
      reasons.push(`🚀 1m: +${m.priceChange1m.toFixed(1)}%`);
    } else if (m.priceChange1m >= 1.5) {
      score += 20;
      reasons.push(`📈 1m: +${m.priceChange1m.toFixed(1)}%`);
    } else if (m.priceChange1m >= 0.5) {
      score += 14;
      reasons.push(`➡️ 1m: +${m.priceChange1m.toFixed(1)}%`);
    } else if (m.priceChange1m >= 0) {
      score += 8;
    } else if (m.priceChange1m >= -0.5) {
      score += 3;
    } else {
      // Negative 1m
      score -= 5;
      reasons.push(`📉 1m: ${m.priceChange1m.toFixed(1)}%`);
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 2: 1-MINUTE BUY PRESSURE (20 points)
    // ═══════════════════════════════════════════════════════════
    
    if (m.hasStrongBuying1m) {
      score += 20;
      reasons.push(`🟢 1m buys: ${(m.buyRatio1m * 100).toFixed(0)}%`);
    } else if (m.buyRatio1m >= 0.55 && m.txnVelocity1m >= 1) {
      score += 15;
    } else if (m.buyRatio1m >= 0.50) {
      score += 10;
    } else if (m.buyRatio1m >= 0.45) {
      score += 5;
    } else {
      // Sells dominating in 1m
      score -= 5;
      if (m.sellRatio1m > 0.55) {
        reasons.push(`🔴 1m sells: ${(m.sellRatio1m * 100).toFixed(0)}%`);
      }
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 3: 1-MINUTE TXN VELOCITY (10 points)
    // ═══════════════════════════════════════════════════════════
    
    if (m.txnVelocity1m >= 10) {
      score += 10;
      reasons.push(`⚡ ${m.txnVelocity1m} txn/min`);
    } else if (m.txnVelocity1m >= 5) {
      score += 8;
      reasons.push(`🔥 ${m.txnVelocity1m} txn/min`);
    } else if (m.txnVelocity1m >= 3) {
      score += 6;
    } else if (m.txnVelocity1m >= 1) {
      score += 3;
    } else {
      // No 1m activity is concerning
      score += 0;
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 4: 5-MINUTE CONFIRMATION (12 points)
    // ═══════════════════════════════════════════════════════════
    
    if (m.priceChange5m >= 5 && m.priceChange5m <= 15) {
      score += 12;
      reasons.push(`✅ 5m: +${m.priceChange5m.toFixed(1)}%`);
    } else if (m.priceChange5m >= 2) {
      score += 10;
    } else if (m.priceChange5m >= 0.5) {
      score += 6;
    } else if (m.priceChange5m >= 0) {
      score += 3;
    } else if (m.priceChange5m >= -1) {
      score += 0;
    } else {
      score -= 5;
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 5: 5-MINUTE BUY PRESSURE (10 points)
    // ═══════════════════════════════════════════════════════════
    
    if (m.hasStrongBuying5m) {
      score += 10;
      reasons.push(`🟢 5m buys: ${(m.buyRatio5m * 100).toFixed(0)}%`);
    } else if (m.buyRatio5m >= 0.52) {
      score += 7;
    } else if (m.buyRatio5m >= 0.48) {
      score += 4;
    } else {
      score -= 3;
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 6: VOLUME HEALTH (8 points)
    // Want active but not overheated
    // ═══════════════════════════════════════════════════════════
    
    // Sweet spot: 2-8% vol/liq in 5m
    if (m.volumeToLiq5m >= 0.02 && m.volumeToLiq5m <= 0.08) {
      score += 8;
      reasons.push(`✅ Vol: ${(m.volumeToLiq5m * 100).toFixed(1)}%`);
    } else if (m.volumeToLiq5m > 0.08 && m.volumeToLiq5m <= 0.15) {
      score += 5;
    } else if (m.volumeToLiq5m > 0.15) {
      score += 2;
      reasons.push(`🌡️ Hot: ${(m.volumeToLiq5m * 100).toFixed(1)}%`);
    } else if (m.volumeToLiq5m < 0.01) {
      score += 3; // Low but not bad
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 7: LIQUIDITY SAFETY (8 points)
    // ═══════════════════════════════════════════════════════════
    
    score += Math.round(m.liquidityScore * 8);
    
    if (m.liquidityScore >= 0.7) {
      reasons.push(`💧 $${(m.liquidityUSD / 1000).toFixed(0)}K`);
    } else if (m.liquidityScore <= 0.3) {
      reasons.push(`⚠️ Low liq: $${(m.liquidityUSD / 1000).toFixed(1)}K`);
    }
  
    // ═══════════════════════════════════════════════════════════
    // SCORING SECTION 8: PRESSURE ACCELERATION (7 points)
    // This is KEY - is momentum BUILDING or FADING?
    // ═══════════════════════════════════════════════════════════
    
    if (m.isPressureBuilding && m.isMomentumBuilding) {
      // Both building = strong signal
      score += 7;
      reasons.push(`⬆️ Accelerating`);
      confidence = 'high';
    } else if (m.isPressureBuilding || m.isMomentumBuilding) {
      score += 4;
      reasons.push(`↗️ Building`);
    } else if (m.isPressureFading && m.isMomentumFading) {
      // Both fading = danger
      score -= 8;
      reasons.push(`⬇️ Fading`);
      confidence = 'low';
    } else if (m.isPressureFading || m.isMomentumFading) {
      score -= 4;
    }
  
    // ═══════════════════════════════════════════════════════════
    // BONUS: VOLUME SPIKE
    // ═══════════════════════════════════════════════════════════
    
    if (m.isVolumeSpike && m.buyRatio1m >= 0.55) {
      score += 5;
      reasons.push(`📊 Vol ${m.volumeAcceleration.toFixed(1)}x`);
    }
  
    // ═══════════════════════════════════════════════════════════
    // PENALTIES: RISK ADJUSTMENTS
    // ═══════════════════════════════════════════════════════════
    
    // Newborn penalty (no bonus!)
    if (tokenType === 'newborn') {
      const ageMinutes = token.ageMinutes || 0;
      if (ageMinutes <= 15) {
        score -= 8;
        reasons.push(`🎯 New: ${ageMinutes}m`);
        confidence = 'low';
      } else if (ageMinutes <= 30) {
        score -= 4;
      }
    }
    
    // Overheated penalty
    if (m.isOverheated1m) {
      score -= 6;
    }
    
    // Any dump signal
    if (m.isDump1m || m.isDump5m) {
      score -= 10;
    }
  
    // ═══════════════════════════════════════════════════════════
    // FINAL SIGNAL DETERMINATION
    // ═══════════════════════════════════════════════════════════
    
    score = Math.max(0, Math.min(100, score));
  
    let signal: 'BUY' | 'WAIT' | 'AVOID' = 'WAIT';
    
    // STRICT BUY CONDITIONS
    const buyConditions = {
      scoreOk: score >= settings.minScore,
      momentum1mOk: m.priceChange1m >= 0,
      momentum5mOk: m.priceChange5m >= -0.5,
      buyPressure1mOk: m.buyRatio1m >= 0.48,
      buyPressure5mOk: m.buyRatio5m >= 0.45,
      volumeOk: m.volumeToLiq5m <= 0.20,
      liquidityOk: m.liquidityScore >= 0.25,
      notDumping: !m.isDump1m && !m.isDump5m,
      notFading: !m.isPressureFading || score >= 75,
      activity1mOk: m.txnVelocity1m >= 1 || m.txnVelocity5m >= 1,
    };
    
    const passedConditions = Object.values(buyConditions).filter(v => v).length;
    const allConditionsMet = Object.values(buyConditions).every(v => v);
    
    if (allConditionsMet) {
      signal = 'BUY';
      reasons.push(`💰 Max: $${m.maxSafePositionUSD.toFixed(0)}`);
      
      // Upgrade confidence if very strong
      if (score >= 80 && m.isPressureBuilding) {
        confidence = 'high';
      }
    } else if (
      score < 30 || 
      m.isDump1m || 
      m.isDump5m ||
      m.isFallingKnife ||
      m.volumeToLiq5m > 0.25 ||
      m.buyRatio1m < 0.40 ||
      passedConditions < 5
    ) {
      signal = 'AVOID';
      confidence = 'high';
    }
  
    return { 
      score, 
      signal, 
      reasons, 
      tokenType,
      maxSafePosition: m.maxSafePositionUSD,
      confidence,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // EXPORT ENGINE
  // ═══════════════════════════════════════════════════════════════
  
  export const MemecoinSniperV1Engine: ScoringEngine = {
    name: 'Memecoin Sniper V1',
    version: '1.1.0',
    description: '1-minute focused memecoin scalper with hard blockers, pressure acceleration detection, and strict safety gates.',
    classify,
    calculateScore,
  };
  
  export default MemecoinSniperV1Engine;