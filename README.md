# 🤖 Solana Memecoin Scalp Bot

A real-time memecoin trading bot for Solana with a self-hosted data pipeline.

**Zero API costs for real-time data** - Uses Helius WebSocket (free tier) for live PumpFun trades.

---

## 📊 System Architecture
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SOLANA BLOCKCHAIN                                   │
│                                                                                 │
│                         PumpFun Bonding Curve Trades                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ WebSocket (FREE)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           HELIUS WEBSOCKET STREAM                                │
│                                                                                 │
│  • Subscribes to ALL PumpFun program transactions                              │
│  • Parses TradeEvent from transaction logs (no RPC calls!)                     │
│  • Extracts: mint, price, solAmount, tokenAmount, isBuy, trader                │
│                                                                                 │
│  Cost: $0/month (uses logsSubscribe, not enhanced transactions)                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
              ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
              │  CANDLE ENGINE  │ │ TRADE STORE │ │   SOL PRICE     │
              │                 │ │             │ │                 │
              │ Builds OHLCV:   │ │ Last 500    │ │ Jupiter API     │
              │ • 1s, 1m, 5m    │ │ trades per  │ │ (every 30s)     │
              │ • 30m, 1h, 24h  │ │ token       │ │                 │
              │                 │ │             │ │ FREE            │
              │ Per-token       │ │ Last 1000   │ │                 │
              │ history         │ │ global      │ │                 │
              └─────────────────┘ └─────────────┘ └─────────────────┘
                        │               │               │
                        └───────────────┴───────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              STREAM API LAYER                                    │
│                                                                                 │
│  GET  /api/stream/status   → Stream health, tokens tracked, stats              │
│  GET  /api/stream/stats    → Token stats (price, volume, txns, candles)        │
│  GET  /api/stream/candles  → OHLCV candle data for charting                    │
│  GET  /api/stream/trades   → Recent trades (per token or global)               │
│  POST /api/stream/batch    → Batch fetch multiple tokens at once               │
│  POST /api/stream/start    → Start the WebSocket stream                        │
│  POST /api/stream/stop     → Stop the WebSocket stream                         │
│                                                                                 │
│  Fallback: If token not in stream → fetches from DexScreener (FREE)            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DISCOVERY LAYER                                     │
│                                                                                 │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐            │
│  │     STREAM DISCOVERY        │    │      HUNTER DISCOVERY       │            │
│  │                             │    │                             │            │
│  │  Every 5s:                  │    │  Every 15s:                 │            │
│  │  • Get global recent trades │    │  • Rotate through sources:  │            │
│  │  • Extract new token mints  │    │    - BirdEye Trending       │            │
│  │  • Add to discovery queue   │    │    - BirdEye New Listings   │            │
│  │                             │    │    - DexScreener Profiles   │            │
│  │  Source: Real-time trades   │    │    - DexScreener Boosts     │            │
│  │  Cost: FREE                 │    │    - DexScreener Gainers    │            │
│  │                             │    │                             │            │
│  │  🌊 in logs                 │    │  Cost: FREE (30k CUs/mo)    │            │
│  └─────────────────────────────┘    │                             │            │
│                                     │  📡 in logs                 │            │
│                                     └─────────────────────────────┘            │
│                                                                                 │
│                         Combined: 3-25 new tokens every 5-15 seconds           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   SIEVE                                          │
│                                                                                 │
│  Processes discovery queue every 80ms:                                          │
│                                                                                 │
│  1. Pop token from queue                                                        │
│  2. Fetch fresh data from Stream API (with DexScreener fallback)               │
│  3. Classify: newborn (<2h) vs established vs reject                           │
│  4. Calculate score (0-100) using Scoring Engine                               │
│  5. If score > threshold → add to Verified Tokens watchlist                    │
│  6. If score too low → add to Rejected Tokens                                  │
│                                                                                 │
│  Speed: ~12 tokens/second (no rate limiting with local stream!)                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SCORING ENGINE                                      │
│                                                                                 │
│  Available Engines:                                                             │
│  • Memecoin Sniper V1 (default) - Optimized for fast scalping                  │
│  • V2 Weighted - Configurable weights                                          │
│  • V1 Simple - Basic momentum scoring                                          │
│                                                                                 │
│  Scoring Factors:                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐        │
│  │ Factor              │ Weight │ Description                        │        │
│  ├────────────────────────────────────────────────────────────────────┤        │
│  │ 5m Price Change     │ 40%    │ Primary momentum signal            │        │
│  │ 5m Buy Pressure     │ 25%    │ Buys vs Sells ratio                │        │
│  │ 1h Buy Pressure     │ 15%    │ Sustained trend confirmation       │        │
│  │ Volume Spike        │ 10%    │ Unusual volume activity            │        │
│  │ Liquidity Health    │ 5%     │ Pool safety check                  │        │
│  │ Freshness Bonus     │ 5%     │ Bonus for newborn tokens           │        │
│  └────────────────────────────────────────────────────────────────────┘        │
│                                                                                 │
│  Output: Score (0-100), Signal (BUY/HOLD/AVOID), Reasons[]                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BATCH SCORING                                       │
│                                                                                 │
│  Every 2 seconds:                                                               │
│  1. Fetch fresh data for ALL verified tokens                                   │
│  2. Re-score each token                                                        │
│  3. Find BUY signals (score >= minScore threshold)                             │
│  4. Execute trades for best opportunities                                       │
│  5. Remove dead/dumping tokens from watchlist                                  │
│                                                                                 │
│  Execution Priority: Highest score first                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PORTFOLIO MANAGEMENT                                   │
│                                                                                 │
│  Every 1.5 seconds:                                                             │
│  1. Fetch fresh prices for ALL active positions                                │
│  2. Calculate P&L for each position                                            │
│  3. Check exit conditions:                                                      │
│                                                                                 │
│     EXIT TRIGGERS:                                                              │
│     ┌────────────────────────────────────────────────────────────────┐         │
│     │ Trigger            │ Condition                     │ Priority │         │
│     ├────────────────────────────────────────────────────────────────┤         │
│     │ Take Profit        │ P&L >= +2% (configurable)     │ 1        │         │
│     │ Stop Loss          │ P&L <= -1.5% (configurable)   │ 2        │         │
│     │ Max Hold Time      │ Hold time >= 180s             │ 3        │         │
│     │ 1m Dump            │ 1m change < -1.5% & P&L < 0.3%│ 4        │         │
│     │ 5m Momentum        │ 5m change < -3% & P&L < 0     │ 5        │         │
│     │ 1m Sell Pressure   │ Sells > Buys * 2 & P&L < 0.5% │ 6        │         │
│     │ 5m Sell Pressure   │ Sells > Buys * 2.5 & P&L < 1% │ 7        │         │
│     └────────────────────────────────────────────────────────────────┘         │
│                                                                                 │
│  4. Execute sells for triggered positions                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔢 Understanding the UI Numbers

### Header Stats

| Stat | Meaning |
|------|---------|
| **REALIZED** | Total profit/loss from closed trades |
| **WIN%** | Percentage of profitable trades |
| **TRADES** | Total number of closed trades |
| **🐣 NEWBORN** | Tokens < 2 hours old that passed filters |
| **📈 ACTIVE** | Established tokens that passed filters |
| **POSITIONS** | Current open trades / max allowed |
| **🌊 STREAM** | Tokens currently tracked by WebSocket stream |

### Status Bar

| Stat | Meaning |
|------|---------|
| **Queue empty** | Discovery queue is empty (all tokens processed) |
| **🌊 230 tracked** | Stream has data for 230 tokens |
| **Cache: 274** | Token data cache has 274 entries |
| **Disc: 0** | Discovery queue length |
| **API: 0** | Pending API requests in queue |
| **81ms** | Last scoring cycle duration |
| **LIVE** | Stream is connected and receiving data |

### Footer Stats

| Stat | Meaning |
|------|---------|
| **🌊 165** | API calls served from local stream |
| **📊 225** | API calls that used DexScreener fallback |
| **LIVE/DEX** | Data source indicator (stream connected or fallback) |

---

## 💰 Cost Breakdown

| Service | Usage | Cost |
|---------|-------|------|
| **Helius WebSocket** | Unlimited trades via logsSubscribe | **$0/month** |
| **BirdEye API** | ~30,000 calls/month (trending + new listings) | **$0/month** (free tier) |
| **DexScreener API** | Unlimited (no auth required) | **$0/month** |
| **Jupiter Price API** | 1 call every 30 seconds | **$0/month** |
| **TOTAL** | | **$0/month** |

### Why It's Free

1. **Helius logsSubscribe** - We subscribe to transaction logs, not enhanced transactions
2. **Parse trades from logs** - We decode the TradeEvent from base64 program data ourselves
3. **No RPC calls per trade** - Everything comes through the WebSocket
4. **Build candles locally** - No need for external OHLCV APIs
5. **DexScreener fallback** - Free, no API key needed

---

## 📁 Project Structure
```
├── composables/
│   ├── useTrader.ts          # Main bot logic
│   ├── useScoringEngine.ts   # Token scoring algorithms
│   └── useTokenQueue.ts      # Token data fetching with queue
│
├── server/
│   ├── api/
│   │   ├── stream/
│   │   │   ├── batch.post.ts    # Batch fetch token data
│   │   │   ├── candles.get.ts   # Get OHLCV candles
│   │   │   ├── start.post.ts    # Start WebSocket stream
│   │   │   ├── stats.get.ts     # Get token stats
│   │   │   ├── status.get.ts    # Stream health check
│   │   │   ├── stop.post.ts     # Stop WebSocket stream
│   │   │   └── trades.get.ts    # Get recent trades
│   │   │
│   │   ├── hunter.get.ts        # Token discovery (BirdEye + DexScreener)
│   │   ├── portfolio.get.ts     # Trade management
│   │   └── trade.post.ts        # Execute trades
│   │
│   ├── plugins/
│   │   └── helius-stream.ts     # Auto-start stream on server boot
│   │
│   └── utils/
│       ├── helius-stream.ts     # WebSocket connection & trade parsing
│       ├── candle-engine.ts     # OHLCV candle building
│       ├── trade-store.ts       # Recent trades storage
│       └── sol-price.ts         # SOL/USD price fetching
│
├── pages/
│   ├── index.vue                # Main trading dashboard
│   └── test.vue                 # Stream testing page
│
└── types/
    └── trading.ts               # TypeScript interfaces
```

---

## 🔧 Configuration

### Environment Variables
```bash
# .env
HELIUS_API_KEY=your-helius-api-key      # Required for WebSocket
BIRDEYE_API_KEY=your-birdeye-api-key    # Optional but recommended
```

### Bot Settings (UI Configurable)
```typescript
{
  // Trade Settings
  buyAmount: 20,           // USD per trade
  takeProfit: 2,           // Exit at +2%
  stopLoss: 1.5,           // Exit at -1.5%
  maxPositions: 5,         // Max concurrent trades
  minScore: 65,            // Minimum score to buy (0-100)
  maxHoldTimeSeconds: 180, // Max hold time before forced exit

  // Newborn Token Filters (< 2 hours old)
  newborn: {
    maxAgeMinutes: 120,    // Max age to be considered "newborn"
    minLiquidity: 5000,    // Minimum $5k liquidity
    maxLiquidity: 100000,  // Maximum $100k liquidity
    minTxns5m: 3,          // At least 3 transactions in 5 minutes
  },

  // Established Token Filters (> 2 hours old)
  established: {
    minLiquidity: 20000,   // Minimum $20k liquidity
    maxLiquidity: 2000000, // Maximum $2M liquidity
    minTxns1h: 50,         // At least 50 transactions per hour
    minVolume1h: 5000,     // At least $5k volume per hour
  },
}
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
yarn install
```

### 2. Set Environment Variables
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run Development Server
```bash
yarn dev
```

### 4. Access the Dashboard

Open `http://localhost:3000` in your browser.

### 5. Start Trading

1. Click **START** to begin the bot
2. Watch the logs for discovered tokens
3. Monitor positions in the right panel
4. Adjust settings via the ⚙️ button

---

## 📈 Data Flow Summary
```
1. DISCOVERY (every 5-15s)
   ├── Stream: Extract tokens from live PumpFun trades
   └── Hunter: BirdEye trending/new + DexScreener profiles/boosts
              ↓
2. SIEVE (every 80ms)
   ├── Fetch token data (stream or DexScreener fallback)
   ├── Classify: newborn vs established vs reject
   └── Score: 0-100 based on momentum, volume, buy pressure
              ↓
3. WATCHLIST (Verified Tokens)
   └── Tokens with score > threshold await re-scoring
              ↓
4. BATCH SCORING (every 2s)
   ├── Re-fetch fresh data for all watched tokens
   ├── Re-score each token
   ├── Find BUY signals (score >= minScore)
   └── Execute trades (highest score first)
              ↓
5. PORTFOLIO MONITORING (every 1.5s)
   ├── Fetch fresh prices for active positions
   ├── Calculate P&L
   ├── Check exit conditions
   └── Execute sells when triggered
```

---

## 🔍 Debugging

### Check Stream Status
```bash
curl http://localhost:3000/api/stream/status | jq
```

### View Token Stats
```bash
curl "http://localhost:3000/api/stream/stats?address=TOKEN_ADDRESS" | jq
```

### Test Page

Visit `http://localhost:3000/test` for real-time stream monitoring.

---

## ⚠️ Disclaimer

This bot is for educational purposes only. Trading cryptocurrencies, especially memecoins, carries significant risk. You may lose your entire investment. Never trade with money you cannot afford to lose.

---

## 📄 License

MIT