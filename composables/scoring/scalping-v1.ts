/**
 * SCALPING V1 SCORING ENGINE
 * 
 * Philosophy: Quick in-and-out trades focused on 5-minute momentum.
 * 
 * Key Principles:
 * - 5-minute price change is the PRIMARY signal (40% weight)
 * - Immediate buy pressure confirms momentum
 * - Two-tier system: Newborn tokens OR Established high-volume tokens
 * - Dead coins (old + low activity) are immediately rejected
 */

import type { 
    TokenData, 
    BotSettings, 
    ScoringResult, 
    ScoringEngine 
  } from '~/types/trading';
  
  // === CLASSIFICATION ===
  function classify(
    token: TokenData, 
    settings: BotSettings
  ): 'newborn' | 'established' | 'reject' {
    const ageMinutes = token.ageMinutes || Infinity;
    const liq = token.liquidity || 0;
    const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0);
    const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0);
    const vol1h = token.volume1h || 0;
  
    // === CATEGORY 1: NEWBORN ===
    // Very new tokens with some initial activity
    if (ageMinutes <= settings.newborn.maxAgeMinutes) {
      if (
        liq >= settings.newborn.minLiquidity &&
        liq <= settings.newborn.maxLiquidity &&
        txns5m >= settings.newborn.minTxns5m
      ) {
        return 'newborn';
      }
      // New but no activity = dead on arrival
      return 'reject';
    }
  
    // === CATEGORY 2: ESTABLISHED ===
    // Older tokens MUST have high activity
    if (
      liq >= settings.established.minLiquidity &&
      liq <= settings.established.maxLiquidity &&
      (txns1h >= settings.established.minTxns1h || vol1h >= settings.established.minVolume1h)
    ) {
      return 'established';
    }
  
    // === REJECT: Dead coins ===
    return 'reject';
  }
  
  // === SCORING ===
  function calculateScore(
    token: TokenData, 
    settings: BotSettings
  ): ScoringResult {
    const w = settings.weights;
    const t = settings.thresholds;
    let score = 0;
    const reasons: string[] = [];
  
    // First, classify the token
    const tokenType = classify(token, settings);
    
    // Immediately reject dead coins
    if (tokenType === 'reject') {
      return { 
        score: 0, 
        signal: 'AVOID', 
        reasons: ['Dead coin - no activity'], 
        tokenType 
      };
    }
  
    // Extract data
    const change5m = token.priceChange5m || 0;
    const buys5m = token.txns5m?.buys || 0;
    const sells5m = token.txns5m?.sells || 0;
    const buys1h = token.txns1h?.buys || 0;
    const sells1h = token.txns1h?.sells || 0;
    const vol5m = token.volume5m || 0;
    const vol1h = token.volume1h || 0;
    const liq = token.liquidity || 0;
  
    // ==========================================
    // 1. 5-MINUTE MOMENTUM (Primary Signal)
    // ==========================================
    if (change5m >= t.strongMomentum5m) {
      score += w.priceChange5m;
      reasons.push(`Strong 5m: +${change5m.toFixed(1)}%`);
    } else if (change5m >= t.goodMomentum5m) {
      score += Math.round(w.priceChange5m * 0.7);
      reasons.push(`Good 5m: +${change5m.toFixed(1)}%`);
    } else if (change5m >= t.minMomentum5m) {
      score += Math.round(w.priceChange5m * 0.4);
    } else if (change5m < 0) {
      score -= Math.round(w.priceChange5m * 0.5);
      reasons.push(`Falling: ${change5m.toFixed(1)}%`);
    }
  
    // ==========================================
    // 2. IMMEDIATE BUY PRESSURE (5m)
    // ==========================================
    const totalTxns5m = buys5m + sells5m;
    if (totalTxns5m >= 2) {
      const buyRatio5m = sells5m > 0 ? buys5m / sells5m : buys5m > 0 ? 2 : 1;
  
      if (buyRatio5m >= t.strongBuyRatio && buys5m > sells5m) {
        score += w.buyPressure5m;
        reasons.push(`Buying 5m: ${buys5m}/${sells5m}`);
      } else if (buyRatio5m >= t.goodBuyRatio) {
        score += Math.round(w.buyPressure5m * 0.6);
      } else if (buyRatio5m < 0.8) {
        score -= Math.round(w.buyPressure5m * 0.5);
        reasons.push(`Selling pressure`);
      }
    }
  
    // ==========================================
    // 3. SUSTAINED BUY PRESSURE (1h)
    // ==========================================
    const totalTxns1h = buys1h + sells1h;
    if (totalTxns1h >= 10) {
      const buyRatio1h = sells1h > 0 ? buys1h / sells1h : buys1h > 0 ? 2 : 1;
  
      if (buyRatio1h >= t.strongBuyRatio) {
        score += w.buyPressure1h;
        reasons.push(`Bullish 1h`);
      } else if (buyRatio1h >= t.goodBuyRatio) {
        score += Math.round(w.buyPressure1h * 0.6);
      } else if (buyRatio1h < 0.9) {
        score -= Math.round(w.buyPressure1h * 0.3);
      }
    }
  
    // ==========================================
    // 4. VOLUME SPIKE
    // ==========================================
    const avgVol5m = vol1h > 0 ? vol1h / 12 : 0;
    if (avgVol5m > 0 && vol5m > avgVol5m * t.volumeSpikeMultiplier) {
      score += w.volumeSpike;
      reasons.push(`Vol spike: ${(vol5m / avgVol5m).toFixed(1)}x`);
    }
  
    // ==========================================
    // 5. LIQUIDITY HEALTH
    // ==========================================
    if (tokenType === 'established' && liq >= 50000) {
      score += w.liquidityHealth;
    } else if (liq >= 10000) {
      score += Math.round(w.liquidityHealth * 0.5);
    }
  
    // ==========================================
    // 6. FRESHNESS BONUS (Newborn only)
    // ==========================================
    if (tokenType === 'newborn') {
      score += w.freshnessBonus;
      reasons.push(`🐣 Newborn ${token.ageMinutes}m`);
    }
  
    // ==========================================
    // FINAL SIGNAL DETERMINATION
    // ==========================================
    score = Math.max(0, Math.min(100, score));
  
    let signal: 'BUY' | 'WAIT' | 'AVOID' = 'WAIT';
    const isMomentumPositive = change5m >= t.minMomentum5m;
    const isBuyingActive = buys5m >= sells5m;
  
    if (score >= settings.minScore && isMomentumPositive && isBuyingActive) {
      signal = 'BUY';
    } else if (score < 25 || change5m < -2 || sells5m > buys5m * 1.5) {
      signal = 'AVOID';
    }
  
    return { score, signal, reasons, tokenType };
  }
  
  // === EXPORT ENGINE ===
  export const ScalpingV1Engine: ScoringEngine = {
    name: 'Scalping V1',
    version: '1.0.0',
    description: 'Quick scalping focused on 5-minute momentum. Two-tier system for newborn and established tokens.',
    classify,
    calculateScore,
  };
  
  export default ScalpingV1Engine;