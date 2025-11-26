# 🤖 SCALP BOT - Solana Memecoin Trading Bot

A high-frequency scalping bot designed for Solana memecoins. Built with Nuxt 3, TypeScript, and Tailwind CSS. Features a modular scoring engine architecture that allows easy experimentation with different trading strategies.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Philosophy & Strategy](#philosophy--strategy)
3. [System Architecture](#system-architecture)
4. [Two-Tier Token Classification](#two-tier-token-classification)
5. [Scoring Engine System](#scoring-engine-system)
6. [How to Add New Scoring Engines](#how-to-add-new-scoring-engines)
7. [Trade Execution Logic](#trade-execution-logic)
8. [Exit Strategies](#exit-strategies)
9. [File Structure](#file-structure)
10. [API Endpoints](#api-endpoints)
11. [Configuration Options](#configuration-options)
12. [Data Flow](#data-flow)
13. [Getting Started](#getting-started)
14. [Known Limitations](#known-limitations)
15. [Future Improvements](#future-improvements)
16. [Discussion Points for Professionals](#discussion-points-for-professionals)

---

## Overview

SCALP BOT is an automated trading system that hunts for short-term profit opportunities in the Solana memecoin market. The bot focuses on **quick in-and-out trades** (seconds to minutes) rather than holding positions long-term.

### Key Characteristics

- **Scalping Focus**: Target 2-3% profits per trade
- **Tight Risk Management**: 2% stop loss to minimize downside
- **High Frequency**: Scans and scores tokens every 2-3 seconds
- **Two-Tier System**: Hunts both brand-new tokens AND established high-volume tokens
- **Modular Scoring Engines**: Easily swap and test different scoring algorithms
- **Paper Trading**: Currently simulates trades (no real blockchain transactions)

---

## Philosophy & Strategy

### Core Principle: Motion Over Everything

The fundamental insight driving this bot is:

> **"Dead coins waste time. We want tokens with MOTION."**

This means we specifically avoid:
- Old tokens with low activity (no one buying or selling)
- New tokens with zero transactions (dead on arrival)
- Tokens in the "middle ground" - not new enough to be exciting, not active enough to trade

### What We Hunt For

We target two distinct categories of tokens:

1. **Newborn Tokens (🐣)**: Super early entries (< 2 hours old) where we can catch the initial pump
2. **Established Active Tokens (📈)**: High-volume tokens with predictable patterns for easy scalping

### Why This Approach?

| Token Type | Age | Liquidity | Activity | Our Interest |
|------------|-----|-----------|----------|--------------|
| Newborn + Active | < 2h | $1k-$50k | Some txns | ✅ HIGH - Early momentum |
| Newborn + Dead | < 2h | Any | No txns | ❌ REJECT - Dead on arrival |
| Old + High Volume | > 2h | $20k+ | 50+ txns/h | ✅ HIGH - Easy scalps |
| Old + Low Volume | > 2h | Any | < 50 txns/h | ❌ REJECT - Dead coin |

---

## System Architecture

### Technology Stack

- **Frontend**: Nuxt 3 + Vue 3 + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Vue Composition API (composables)
- **Backend**: Nuxt Server Routes (Nitro)
- **Database**: JSON file storage (simple persistence)
- **APIs**: DexScreener (primary), BirdEye (secondary)

### Core Components
```
┌─────────────────────────────────────────────────────────────────┐
│                        SCALP BOT SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   HUNTER     │───▶│    SIEVE     │───▶│  WATCHLIST   │       │
│  │  (Discovery) │    │  (Filtering) │    │  (Verified)  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                              │                    │              │
│                              ▼                    ▼              │
│                    ┌──────────────────────────────────┐         │
│                    │        SCORING ENGINE            │         │
│                    │  ┌────────────────────────────┐  │         │
│                    │  │  • Scalping V1 (default)   │  │         │
│                    │  │  • [Your Custom Engine]    │  │         │
│                    │  │  • [Another Strategy]      │  │         │
│                    │  └────────────────────────────┘  │         │
│                    └──────────────────────────────────┘         │
│                                   │                              │
│                                   ▼                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   EXECUTOR   │◀───│   SIGNALS    │    │  PORTFOLIO   │       │
│  │   (Trades)   │    │  (BUY/SELL)  │───▶│  (Positions) │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Two-Tier Token Classification

### Tier 1: Newborn Tokens 🐣

**Purpose**: Catch tokens in their first hours of life when explosive moves happen.

**Default Criteria**:
```
Age:        < 120 minutes (2 hours)
Liquidity:  $1,000 - $50,000
Activity:   At least 1 transaction in last 5 minutes
```

**Why these parameters?**

- **Age < 2 hours**: The most explosive price action happens in the first hours
- **Min Liquidity $1k**: Below this, slippage makes trading impossible
- **Max Liquidity $50k**: Above this, the "early opportunity" is already gone
- **Min 1 txn/5m**: Proves someone is actually trading it

### Tier 2: Established Active Tokens 📈

**Purpose**: Trade tokens with high activity where patterns are more predictable.

**Default Criteria**:
```
Age:        Any (but typically < 7 days)
Liquidity:  $20,000 - $2,000,000
Activity:   50+ transactions/hour OR $5,000+ volume/hour
```

**Why these parameters?**

- **Min Liquidity $20k**: Ensures we can enter/exit without major slippage
- **Max Liquidity $2M**: Avoids mega-caps where retail has less edge
- **50+ txns/hour**: Proves consistent trading activity
- **$5k+ volume/hour**: Alternative activity metric

### Rejected: Dead Coins 💀

Any token that doesn't fit either tier is immediately rejected:

- Old tokens (> 2h) with low activity (< 50 txns/h)
- New tokens with zero activity
- Tokens with insufficient or excessive liquidity

---

## Scoring Engine System

The bot uses a **modular scoring engine architecture** that allows you to easily swap between different trading strategies.

### Why Modular Engines?

1. **Experimentation**: Test different strategies without changing core code
2. **Comparison**: Run the same tokens through different algorithms
3. **Iteration**: Quickly iterate on scoring logic
4. **Collaboration**: Share and import strategies from others

### Default Engine: Scalping V1

The default engine uses a **100-point scoring system** heavily weighted toward short-term momentum.

#### Weight Distribution

| Factor | Points | Purpose |
|--------|--------|---------|
| 5-Minute Price Change | 40 | **PRIMARY SIGNAL** - Recent momentum |
| 5-Minute Buy Pressure | 25 | Are buyers dominating RIGHT NOW? |
| 1-Hour Buy Pressure | 15 | Confirms sustained trend |
| Volume Spike | 10 | Unusual activity = opportunity |
| Liquidity Health | 5 | Basic safety check |
| Freshness Bonus | 5 | Bonus for newborn tokens |

#### Signal Determination
```typescript
if (score >= 65 AND priceChange5m > 0.3% AND buys5m >= sells5m) {
  signal = "BUY"
} else if (score < 25 OR priceChange5m < -2% OR sells5m > buys5m * 1.5) {
  signal = "AVOID"
} else {
  signal = "WAIT"
}
```

---

## How to Add New Scoring Engines

Adding a new scoring engine is straightforward. Follow these steps:

### Step 1: Create the Engine File

Create a new file in `composables/scoring/` (e.g., `my-strategy.ts`):
```typescript
/**
 * MY CUSTOM STRATEGY
 * 
 * Description of what this strategy does and why.
 */

import type { 
  TokenData, 
  BotSettings, 
  ScoringResult, 
  ScoringEngine 
} from '~/types/trading';

// === CLASSIFICATION FUNCTION ===
// Determines if a token is 'newborn', 'established', or 'reject'
function classify(
  token: TokenData, 
  settings: BotSettings
): 'newborn' | 'established' | 'reject' {
  const ageMinutes = token.ageMinutes || Infinity;
  const liq = token.liquidity || 0;
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0);
  const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0);
  const vol1h = token.volume1h || 0;

  // Your classification logic here
  // Must return 'newborn', 'established', or 'reject'
  
  if (ageMinutes <= settings.newborn.maxAgeMinutes) {
    if (liq >= settings.newborn.minLiquidity && txns5m >= settings.newborn.minTxns5m) {
      return 'newborn';
    }
    return 'reject';
  }

  if (liq >= settings.established.minLiquidity && txns1h >= settings.established.minTxns1h) {
    return 'established';
  }

  return 'reject';
}

// === SCORING FUNCTION ===
// Returns score (0-100), signal, reasons, and tokenType
function calculateScore(
  token: TokenData, 
  settings: BotSettings
): ScoringResult {
  const reasons: string[] = [];
  let score = 0;

  // First classify the token
  const tokenType = classify(token, settings);
  
  if (tokenType === 'reject') {
    return { 
      score: 0, 
      signal: 'AVOID', 
      reasons: ['Does not meet criteria'], 
      tokenType 
    };
  }

  // === YOUR CUSTOM SCORING LOGIC HERE ===
  
  // Example: Simple momentum-based scoring
  const change5m = token.priceChange5m || 0;
  
  if (change5m > 5) {
    score += 50;
    reasons.push(`Strong momentum: +${change5m.toFixed(1)}%`);
  } else if (change5m > 2) {
    score += 30;
    reasons.push(`Good momentum: +${change5m.toFixed(1)}%`);
  } else if (change5m > 0) {
    score += 15;
  } else {
    score -= 20;
    reasons.push(`Negative momentum: ${change5m.toFixed(1)}%`);
  }

  // Add more scoring factors...
  
  // === DETERMINE SIGNAL ===
  score = Math.max(0, Math.min(100, score));
  
  let signal: 'BUY' | 'WAIT' | 'AVOID' = 'WAIT';
  
  if (score >= settings.minScore && change5m > 0) {
    signal = 'BUY';
  } else if (score < 25) {
    signal = 'AVOID';
  }

  return { score, signal, reasons, tokenType };
}

// === EXPORT THE ENGINE ===
export const MyStrategyEngine: ScoringEngine = {
  name: 'My Custom Strategy',
  version: '1.0.0',
  description: 'A brief description of what makes this strategy unique.',
  classify,
  calculateScore,
};

export default MyStrategyEngine;
```

### Step 2: Register the Engine

Add your engine to `composables/scoring/index.ts`:
```typescript
import type { ScoringEngine } from '~/types/trading';
import { ScalpingV1Engine } from './scalping-v1';
import { MyStrategyEngine } from './my-strategy';  // Add this import

// === AVAILABLE ENGINES ===
export const SCORING_ENGINES: Record = {
  'scalping-v1': ScalpingV1Engine,
  'my-strategy': MyStrategyEngine,  // Add this line
};

// === DEFAULT ENGINE ===
export const DEFAULT_ENGINE = 'scalping-v1';

// ... rest of the file stays the same
```

### Step 3: Use Your Engine

Your engine will now appear in the Settings → Engine tab in the UI. Click on it to activate it!

### Engine Interface Reference

Every scoring engine must implement this interface:
```typescript
interface ScoringEngine {
  name: string;        // Display name (e.g., "My Strategy")
  version: string;     // Version number (e.g., "1.0.0")
  description: string; // Brief description for the UI
  
  classify: (token: TokenData, settings: BotSettings) => 'newborn' | 'established' | 'reject';
  calculateScore: (token: TokenData, settings: BotSettings) => ScoringResult;
}

interface ScoringResult {
  score: number;                              // 0-100
  signal: 'BUY' | 'WAIT' | 'AVOID';          // Trading signal
  reasons: string[];                          // Human-readable explanations
  tokenType: 'newborn' | 'established' | 'reject';
}
```

### Available Token Data

Your scoring function receives this data for each token:
```typescript
interface TokenData {
  address: string;
  symbol: string;
  name?: string;
  logoURI?: string;
  price: number;
  liquidity: number;
  fdv?: number;
  ageMinutes?: number;
  ageHours?: number;
  
  // Price changes
  priceChange5m: number;   // % change in last 5 minutes
  priceChange1h: number;   // % change in last hour
  
  // Volume
  volume5m: number;        // Volume in last 5 minutes (USD)
  volume1h: number;        // Volume in last hour (USD)
  
  // Transactions
  txns5m: {
    buys: number;          // Buy count in last 5 minutes
    sells: number;         // Sell count in last 5 minutes
  };
  txns1h: {
    buys: number;          // Buy count in last hour
    sells: number;         // Sell count in last hour
  };
}
```

### Example Engines You Could Build

1. **Conservative Engine**: Only buy on very strong signals (score > 80)
2. **Aggressive Engine**: Buy on moderate signals with higher risk tolerance
3. **Volume-Focused Engine**: Prioritize volume spikes over price momentum
4. **Buy-Pressure Engine**: Focus heavily on buy/sell ratio
5. **Newborn-Only Engine**: Ignore established tokens, focus only on new launches
6. **Whale-Watcher Engine**: Track large transactions as signals

---

## Trade Execution Logic

### Entry Conditions

A trade is executed when ALL conditions are met:

1. ✅ Token has BUY signal from scoring engine
2. ✅ Score >= minimum threshold (default: 65)
3. ✅ Current positions < max positions (default: 5)
4. ✅ Token not already held
5. ✅ 5-minute price change is positive
6. ✅ Buy pressure >= sell pressure

### Position Sizing

Currently uses fixed position sizing:
- Default: $20 per trade
- Configurable: $10 to $100+

### Execution Flow
```
1. Token passes all filters → Added to verified watchlist
2. Scoring cycle runs every 2 seconds
3. Token scores above threshold with BUY signal
4. Bot checks position limits
5. Trade recorded in database
6. Token removed from watchlist
7. Position monitoring begins (every 3 seconds)
```

---

## Exit Strategies

The bot uses multiple exit strategies to protect profits and limit losses.

### 1. Take Profit (TP)
```
Default: +3%
Trigger: When position PnL >= take profit threshold
Action: Immediately close position
```

### 2. Stop Loss (SL)
```
Default: -2%
Trigger: When position PnL <= stop loss threshold
Action: Immediately close position
```

### 3. Momentum Exit
```
Trigger: 5-minute price change < -2% AND position is in loss
Action: Close position early
Rationale: If momentum reversed, exit before stop loss
```

### 4. Sell Pressure Exit
```
Trigger: Sells > Buys × 2 in last 5 minutes AND profit < 1%
Action: Close position
Rationale: When sellers dominate, price will likely drop
```

### Exit Priority
```
1. Take Profit (lock in gains)
2. Stop Loss (protect capital)
3. Momentum Exit (early warning)
4. Sell Pressure Exit (crowd behavior)
```

---

## File Structure
```
├── composables/
│   ├── scoring/
│   │   ├── index.ts              # Engine registry & exports
│   │   └── scalping-v1.ts        # Default scalping engine
│   ├── useScoringEngine.ts       # Scoring engine composable
│   └── useTrader.ts              # Main trading logic
│
├── types/
│   └── trading.ts                # TypeScript interfaces
│
├── pages/
│   └── index.vue                 # Main UI
│
├── server/
│   ├── api/
│   │   ├── hunter.get.ts         # Token discovery
│   │   ├── trade.post.ts         # Trade execution
│   │   ├── portfolio.get.ts      # Portfolio retrieval
│   │   ├── prices.post.ts        # Batch price fetching
│   │   └── enrich.post.ts        # Token enrichment
│   └── utils/
│       └── db.ts                 # Database utilities
│
├── data/
│   └── trades.json               # Trade storage
│
└── public/
    └── robots.txt
```

---

## API Endpoints

### GET /api/hunter

Discovers new tokens from various sources.

**Query Parameters:**
- `type`: `auto` | `newborn` | `active` | `trending` | `boosts` | `profiles`

**Response:**
```json
{
  "success": true,
  "source": "Newborn <2h (15)",
  "data": {
    "items": [
      {
        "address": "...",
        "symbol": "$TOKEN",
        "liquidity": 5000,
        "priceChange5m": 2.5,
        "txns": { "m5": { "buys": 10, "sells": 5 } }
      }
    ]
  }
}
```

### POST /api/trade

Executes buy/sell actions.

**Request Body:**
```json
{
  "action": "OPEN",
  "token": { "address": "...", "symbol": "...", "price": 0.001 },
  "amount": 20
}
```
```json
{
  "action": "CLOSE",
  "tradeId": "abc123",
  "currentPrice": 0.00105
}
```

### GET /api/portfolio

Retrieves current positions and history.

**Response:**
```json
{
  "trades": [...],
  "history": [...]
}
```

---

## Configuration Options

### General Settings

| Setting | Default | Description |
|---------|---------|-------------|
| buyAmount | $20 | Amount per trade |
| takeProfit | 3% | Take profit threshold |
| stopLoss | 2% | Stop loss threshold |
| maxPositions | 5 | Maximum concurrent positions |
| minScore | 65 | Minimum score for BUY signal |

### Newborn Token Settings

| Setting | Default | Description |
|---------|---------|-------------|
| maxAgeMinutes | 120 | Maximum token age (2 hours) |
| minLiquidity | $1,000 | Minimum liquidity |
| maxLiquidity | $50,000 | Maximum liquidity |
| minTxns5m | 1 | Minimum transactions in 5m |

### Established Token Settings

| Setting | Default | Description |
|---------|---------|-------------|
| minLiquidity | $20,000 | Minimum liquidity |
| maxLiquidity | $2,000,000 | Maximum liquidity |
| minTxns1h | 50 | Minimum transactions per hour |
| minVolume1h | $5,000 | Minimum volume per hour |

### Scoring Weights (Scalping V1)

| Weight | Default | Description |
|--------|---------|-------------|
| priceChange5m | 40 | 5-minute momentum weight |
| buyPressure5m | 25 | Immediate buy pressure |
| buyPressure1h | 15 | Sustained buy pressure |
| volumeSpike | 10 | Volume spike detection |
| liquidityHealth | 5 | Liquidity safety |
| freshnessBonus | 5 | Newborn token bonus |

### Thresholds

| Threshold | Default | Description |
|-----------|---------|-------------|
| strongMomentum5m | 3% | Strong momentum threshold |
| goodMomentum5m | 1% | Good momentum threshold |
| minMomentum5m | 0.3% | Minimum for BUY signal |
| strongBuyRatio | 1.3 | Strong buy/sell ratio |
| goodBuyRatio | 1.1 | Good buy/sell ratio |
| volumeSpikeMultiplier | 1.5 | Volume spike detection |

---

## Data Flow

### Complete Trading Cycle
```
┌─────────────────────────────────────────────────────────────────┐
│                         DISCOVERY (10s)                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Newborn  │    │ HighVol  │    │ Profiles │    │ Boosts   │  │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │
│       └───────────────┴───────────────┴───────────────┘        │
│                              │                                   │
│                              ▼                                   │
│                     Discovery Queue                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SIEVE (200ms/token)                         │
│                                                                  │
│  Token ──▶ Fetch Data ──▶ Classify ──▶ Score ──▶ Watchlist      │
│                │                                                 │
│                ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Classification (via Scoring Engine):                     │    │
│  │   • Newborn + Active    → ACCEPT 🐣                      │    │
│  │   • Established + Active → ACCEPT 📈                     │    │
│  │   • Everything else      → REJECT 💀                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SCORING LOOP (Every 2s)                         │
│                                                                  │
│  1. Fetch fresh data for all verified tokens                    │
│  2. Run through active Scoring Engine                           │
│  3. Update scores and signals                                   │
│  4. Execute BUY on qualifying tokens                            │
│  5. Remove dead/bad tokens                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                POSITION MONITORING (Every 3s)                    │
│                                                                  │
│  For each open position:                                        │
│    1. Fetch current price                                       │
│    2. Calculate PnL                                             │
│    3. Check exit conditions:                                    │
│       • Take Profit hit?     → SELL ✅                          │
│       • Stop Loss hit?       → SELL 🛑                          │
│       • Momentum reversed?   → SELL ⚠️                          │
│       • Sell pressure?       → SELL 📉                          │
└─────────────────────────────────────────────────────────────────┘
```

### Timing Summary

| Process | Interval | Purpose |
|---------|----------|---------|
| Discovery | 10 seconds | Find new tokens |
| Sieve | 200ms per token | Process queue |
| Scoring | 2 seconds | Update all tokens |
| Portfolio | 3 seconds | Monitor positions |
| Cleanup | 30 seconds | Remove stale data |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn or npm
- BirdEye API key (optional)

### Installation
```bash
# Clone the repository
git clone 
cd scalp-bot

# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run development server
yarn dev
```

### Environment Variables
```env
NUXT_BIRDEYE_API_KEY=your_birdeye_api_key
NUXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NUXT_PUBLIC_SOLANA_RPC_HOST=https://api.mainnet-beta.solana.com
```

### First Run

1. Open `http://localhost:3000`
2. Click **⚙️** to review settings
3. Adjust parameters as needed
4. Click **START** to begin

---

## Known Limitations

### 1. Paper Trading Only

The bot does NOT execute real blockchain transactions. It simulates trades by recording prices.

**For real trading, you would need:**
- Jupiter or Raydium swap integration
- Wallet transaction signing
- Slippage handling
- Gas fee management

### 2. API Rate Limits

DexScreener has rate limits. The bot batches requests (30 tokens max) but heavy usage may trigger limits.

### 3. Data Latency

Price data is typically 5-30 seconds delayed. No websocket support currently.

### 4. Single Instance

Designed for single-instance operation with local JSON storage.

### 5. No Backtesting

No historical data analysis or strategy backtesting currently available.

---

## Future Improvements

### High Priority

1. **Real Trading Integration** - Jupiter swap, wallet signing
2. **WebSocket Data** - Real-time price feeds
3. **Backtesting Engine** - Historical strategy testing

### Medium Priority

4. **Advanced Exits** - Trailing stops, partial exits
5. **Risk Management** - Daily limits, position sizing
6. **Machine Learning** - Pattern recognition

### Low Priority

7. **Multi-Chain** - Ethereum, Base support
8. **Social Signals** - Twitter, Telegram monitoring
9. **Analytics Dashboard** - Performance charts

---

## Discussion Points for Professionals

### Questions to Consider

1. **Scoring Algorithm**
   - Is 40% weight on 5-minute momentum optimal?
   - Should we incorporate other timeframes?
   - How do we handle different market conditions?

2. **Entry Timing**
   - Are we entering too early or too late?
   - Should we wait for confirmation?
   - How do we avoid fake breakouts?

3. **Exit Strategy**
   - Is 3% TP too conservative?
   - Should TP/SL be dynamic based on volatility?
   - How do we maximize winners?

4. **Token Selection**
   - Are our two-tier criteria optimal?
   - What other filters should we consider?
   - How do we detect rug pulls?

5. **Risk Management**
   - What's the optimal position size?
   - Should we scale in/out?
   - How do we handle correlated positions?

6. **Scoring Engine Ideas**
   - What alternative strategies should we test?
   - How do we measure engine performance?
   - Should engines be market-condition aware?

---

## License

MIT License - Use at your own risk. This is experimental software.

---

## Disclaimer

⚠️ **WARNING**: Trading cryptocurrencies is extremely risky. You can lose all of your investment. This bot is for educational purposes only. The authors are not responsible for any financial losses.

Always:
- Only trade with money you can afford to lose
- Understand the risks
- Test thoroughly before using real funds
- Consult with financial professionals