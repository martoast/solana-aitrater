/**
 * Helius WebSocket Stream Manager
 * 
 * Connects to Helius WebSocket to receive real-time PumpFun transactions.
 * Parses trades directly from logs to avoid RPC calls (saves credits!).
 */

import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
// Use renamed imports to avoid Nuxt auto-import conflicts
import { 
  updateCandles as candleEngineUpdate, 
  setSolPrice as candleEngineSetSolPrice 
} from './candle-engine';
import { addTrade as tradeStoreAdd } from './trade-store';
import { PUMPFUN_PROGRAM_ID } from './pumpfun-idl';
import type { PumpFunTrade } from './pumpfun-parser';

// === TYPES ===
interface HeliusConfig {
  apiKey: string;
  rpcUrl?: string;
}

interface StreamStats {
  connected: boolean;
  lastMessage: number;
  messagesReceived: number;
  tradesProcessed: number;
  errors: number;
  reconnects: number;
  startedAt: number;
  queueSize: number;
  skipped: number;
  parsedFromLogs: number;
  parseFailures: number;
}

// === STATE ===
let ws: WebSocket | null = null;
let config: HeliusConfig | null = null;
let isRunning = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let solPriceTimer: NodeJS.Timeout | null = null;

const stats: StreamStats = {
  connected: false,
  lastMessage: 0,
  messagesReceived: 0,
  tradesProcessed: 0,
  errors: 0,
  reconnects: 0,
  startedAt: 0,
  queueSize: 0,
  skipped: 0,
  parsedFromLogs: 0,
  parseFailures: 0,
};

// === INITIALIZATION ===

export function initializeStream(apiKey: string): void {
  if (!apiKey) {
    console.error('[HeliusStream] No API key provided');
    return;
  }

  config = {
    apiKey,
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
  };
  
  console.log('[HeliusStream] Initialized with API key');
}

export function startStream(): void {
  if (!config) {
    console.error('[HeliusStream] Not initialized. Call initializeStream first.');
    return;
  }

  if (isRunning) {
    console.log('[HeliusStream] Already running');
    return;
  }

  isRunning = true;
  stats.startedAt = Date.now();
  stats.tradesProcessed = 0;
  stats.parsedFromLogs = 0;
  stats.parseFailures = 0;
  stats.errors = 0;
  stats.reconnects = 0;
  
  connect();
  startSolPriceUpdater();
  
  console.log('[HeliusStream] Stream started');
}

export function stopStream(): void {
  isRunning = false;
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  
  if (solPriceTimer) {
    clearInterval(solPriceTimer);
    solPriceTimer = null;
  }
  
  stats.connected = false;
  console.log('[HeliusStream] Stream stopped');
}

// === WEBSOCKET CONNECTION ===

function connect(): void {
  if (!config || !isRunning) return;

  const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${config.apiKey}`;
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
      console.log('[HeliusStream] WebSocket connected');
      stats.connected = true;
      stats.lastMessage = Date.now();
      
      subscribeToProgram();
      startHeartbeat();
    });

    ws.on('message', (data: WebSocket.Data) => {
      handleMessage(data);
    });

    ws.on('error', (error) => {
      console.error('[HeliusStream] WebSocket error:', error.message);
      stats.errors++;
    });

    ws.on('close', () => {
      console.log('[HeliusStream] WebSocket closed');
      stats.connected = false;
      
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      
      if (isRunning) {
        scheduleReconnect();
      }
    });
  } catch (e: any) {
    console.error('[HeliusStream] Failed to connect:', e.message);
    stats.errors++;
    scheduleReconnect();
  }
}

function subscribeToProgram(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const subscribeMsg = {
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID] },
      { commitment: 'confirmed' }
    ]
  };

  ws.send(JSON.stringify(subscribeMsg));
  console.log('[HeliusStream] Subscribed to PumpFun program');
}

function scheduleReconnect(): void {
  if (reconnectTimer || !isRunning) return;
  
  stats.reconnects++;
  const delay = Math.min(5000 * stats.reconnects, 30000);
  
  console.log(`[HeliusStream] Reconnecting in ${delay}ms...`);
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
      
      const timeSinceLastMessage = Date.now() - stats.lastMessage;
      if (timeSinceLastMessage > 60000) {
        console.log('[HeliusStream] No messages for 60s, reconnecting...');
        ws.close();
      }
    }
  }, 30000);
}

// === MESSAGE HANDLING ===

function handleMessage(data: WebSocket.Data): void {
  stats.messagesReceived++;
  stats.lastMessage = Date.now();

  try {
    const message = JSON.parse(data.toString());
    
    // Handle subscription confirmation
    if (message.result !== undefined && message.id) {
      console.log(`[HeliusStream] Subscription confirmed: ${message.result}`);
      return;
    }

    // Handle log notifications
    if (message.method === 'logsNotification') {
      const value = message.params?.result?.value;
      if (value && !value.err && value.logs) {
        const trades = parseAllTradesFromLogs(value.signature, value.logs);
        
        for (const trade of trades) {
          processTrade(trade);
          stats.parsedFromLogs++;
        }
      }
    }
  } catch (e) {
    // Not all messages are JSON - that's okay
  }
}

// === PARSE ALL TRADES FROM LOGS ===

function parseAllTradesFromLogs(signature: string, logs: string[]): PumpFunTrade[] {
  const trades: PumpFunTrade[] = [];
  
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    
    if (!log.includes('Program data:')) continue;
    
    const base64Match = log.match(/Program data: (.+)/);
    if (!base64Match) continue;
    
    const base64Data = base64Match[1];
    
    try {
      const trade = decodeTradeEvent(signature, base64Data);
      if (trade) {
        trades.push(trade);
      }
    } catch (e) {
      stats.parseFailures++;
    }
  }
  
  return trades;
}

function decodeTradeEvent(signature: string, base64Data: string): PumpFunTrade | null {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    
    // PumpFun TradeEvent is 113+ bytes
    if (buffer.length < 105) {
      return null;
    }
    
    let offset = 8; // Skip 8-byte discriminator
    
    // Read mint (32 bytes)
    if (offset + 32 > buffer.length) return null;
    const mintBytes = buffer.subarray(offset, offset + 32);
    let mint: string;
    try {
      mint = new PublicKey(mintBytes).toBase58();
    } catch {
      return null;
    }
    offset += 32;
    
    // Read solAmount (u64, 8 bytes)
    if (offset + 8 > buffer.length) return null;
    const solAmountRaw = buffer.readBigUInt64LE(offset);
    const solAmount = Number(solAmountRaw) / 1e9;
    offset += 8;
    
    // Validate solAmount is reasonable
    if (solAmount < 0.0001 || solAmount > 10000) {
      return null;
    }
    
    // Read tokenAmount (u64, 8 bytes)
    if (offset + 8 > buffer.length) return null;
    const tokenAmountRaw = buffer.readBigUInt64LE(offset);
    const tokenAmount = Number(tokenAmountRaw);
    offset += 8;
    
    // Read isBuy (1 byte)
    if (offset + 1 > buffer.length) return null;
    const isBuy = buffer.readUInt8(offset) === 1;
    offset += 1;
    
    // Read user/trader (32 bytes)
    if (offset + 32 > buffer.length) return null;
    const userBytes = buffer.subarray(offset, offset + 32);
    let trader: string;
    try {
      trader = new PublicKey(userBytes).toBase58();
    } catch {
      return null;
    }
    offset += 32;
    
    // Read timestamp (i64, 8 bytes)
    if (offset + 8 > buffer.length) return null;
    const timestampRaw = buffer.readBigInt64LE(offset);
    let timestamp = Number(timestampRaw) * 1000;
    
    // Validate timestamp
    const now = Date.now();
    if (timestamp < 1577836800000 || timestamp > now + 86400000) {
      timestamp = now;
    }
    offset += 8;
    
    // Read virtual reserves for price calculation
    if (offset + 16 > buffer.length) {
      const price = tokenAmount > 0 ? solAmount / tokenAmount : 0;
      if (price <= 0) return null;
      
      return {
        signature,
        mint,
        solAmount,
        tokenAmount,
        isBuy,
        trader,
        timestamp,
        price,
        slot: 0,
      };
    }
    
    const virtualSolReserves = Number(buffer.readBigUInt64LE(offset)) / 1e9;
    offset += 8;
    const virtualTokenReserves = Number(buffer.readBigUInt64LE(offset));
    
    // Calculate price from reserves
    const price = virtualTokenReserves > 0 
      ? virtualSolReserves / virtualTokenReserves 
      : (tokenAmount > 0 ? solAmount / tokenAmount : 0);
    
    if (price <= 0) return null;
    
    return {
      signature,
      mint,
      solAmount,
      tokenAmount,
      isBuy,
      trader,
      timestamp,
      price,
      slot: 0,
    };
  } catch (e) {
    return null;
  }
}

// === PROCESS TRADE ===

function processTrade(trade: PumpFunTrade): void {
  // Update candle engine (using renamed import)
  candleEngineUpdate(
    trade.mint,
    trade.price,
    trade.solAmount,
    trade.isBuy,
    trade.timestamp
  );

  // Store trade (using renamed import)
  tradeStoreAdd(trade);

  stats.tradesProcessed++;
  
  // Log every 100 trades
  if (stats.tradesProcessed % 100 === 0) {
    console.log(
      `[HeliusStream] 📊 ${stats.tradesProcessed} trades | ` +
      `Parsed: ${stats.parsedFromLogs} | ` +
      `Failures: ${stats.parseFailures} | ` +
      `Last: ${trade.mint.slice(0, 8)}... ${trade.isBuy ? 'BUY' : 'SELL'} ${trade.solAmount.toFixed(3)} SOL`
    );
  }
}

// === SOL PRICE UPDATER ===

function startSolPriceUpdater(): void {
  updateSolPrice();
  solPriceTimer = setInterval(updateSolPrice, 30000); // Every 30s
}

async function updateSolPrice(): Promise<void> {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await res.json();
    const price = data.data?.['So11111111111111111111111111111111111111112']?.price;
    
    if (price && price > 0) {
      // Use renamed import
      candleEngineSetSolPrice(parseFloat(price));
      console.log(`[HeliusStream] 💰 SOL: $${parseFloat(price).toFixed(2)}`);
    }
  } catch (e: any) {
    console.error('[HeliusStream] SOL price error:', e.message);
  }
}

// === PUBLIC API ===

export function getStreamStats(): StreamStats & { uptime: number } {
  return {
    connected: stats.connected,
    lastMessage: stats.lastMessage,
    messagesReceived: stats.messagesReceived,
    tradesProcessed: stats.tradesProcessed,
    errors: stats.errors,
    reconnects: stats.reconnects,
    startedAt: stats.startedAt,
    queueSize: stats.queueSize,
    skipped: stats.skipped,
    parsedFromLogs: stats.parsedFromLogs,
    parseFailures: stats.parseFailures,
    uptime: stats.startedAt > 0 ? Date.now() - stats.startedAt : 0,
  };
}

export function isStreamConnected(): boolean {
  return stats.connected;
}

export function isStreamRunning(): boolean {
  return isRunning;
}