/**
 * PumpFun Transaction Parser
 * 
 * Parses raw Solana transactions to extract PumpFun trade data.
 * Uses instruction parsing + event parsing for reliability.
 */

import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import * as borsh from '@coral-xyz/borsh';
import { PUMPFUN_PROGRAM_ID } from './pumpfun-idl';

// === TYPES ===
export interface PumpFunTrade {
  signature: string;
  mint: string;
  solAmount: number;      // In SOL (not lamports)
  tokenAmount: number;    // Raw token amount
  isBuy: boolean;
  trader: string;
  timestamp: number;      // Unix ms
  price: number;          // SOL per token
  slot: number;
}

export interface ParsedTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  meta: {
    preBalances: number[];
    postBalances: number[];
    logMessages?: string[];
  } | null;
  transaction: {
    message: {
      accountKeys: { pubkey: PublicKey }[];
      instructions: {
        programId: PublicKey;
        accounts: PublicKey[];
        data: string;
      }[];
    };
  };
}

// === SHA256 HELPER ===
function sha256(data: string): Buffer {
  return createHash('sha256').update(data).digest();
}

// === DISCRIMINATORS ===
const BUY_DISCRIMINATOR = sha256('global:buy').subarray(0, 8);
const SELL_DISCRIMINATOR = sha256('global:sell').subarray(0, 8);

// === BORSH SCHEMA ===
const tradeSchema = borsh.struct([
  borsh.u64('discriminator'),
  borsh.u64('amount'),
  borsh.u64('solEstimate'),
]);

// === BASE58 DECODE ===
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`Invalid base58 character: ${char}`);
    
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  
  // Handle leading zeros
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  
  return Buffer.from(bytes.reverse());
}

// === PARSER CLASS ===
export class PumpFunParser {
  private programId: PublicKey;

  constructor() {
    this.programId = new PublicKey(PUMPFUN_PROGRAM_ID);
  }

  /**
   * Parse a transaction and extract all PumpFun trades
   */
  parse(tx: ParsedTransaction): PumpFunTrade[] {
    const trades: PumpFunTrade[] = [];
    
    if (!tx || !tx.transaction?.message?.instructions) {
      return trades;
    }

    const instructions = tx.transaction.message.instructions;
    const accountKeys = tx.transaction.message.accountKeys;

    for (const ix of instructions) {
      // Skip if not PumpFun program
      if (!ix.programId.equals(this.programId)) continue;

      try {
        const trade = this.parseInstruction(ix, tx, accountKeys);
        if (trade) {
          trades.push(trade);
        }
      } catch (e) {
        // Skip malformed instructions
        console.error('Failed to parse instruction:', e);
      }
    }

    return trades;
  }

  /**
   * Parse a single instruction
   */
  private parseInstruction(
    ix: { programId: PublicKey; accounts: PublicKey[]; data: string },
    tx: ParsedTransaction,
    accountKeys: { pubkey: PublicKey }[]
  ): PumpFunTrade | null {
    if (!ix.data) return null;
    
    const dataBuffer = base58Decode(ix.data);
    const discriminator = dataBuffer.subarray(0, 8);

    const isBuy = discriminator.equals(BUY_DISCRIMINATOR);
    const isSell = discriminator.equals(SELL_DISCRIMINATOR);

    if (!isBuy && !isSell) {
      return null; // Not a trade instruction
    }

    // Decode instruction data
    const decoded = tradeSchema.decode(dataBuffer);
    const tokenAmount = Number(decoded.amount);

    // Get accounts from instruction
    // Buy/Sell account layout:
    // [0] global, [1] feeRecipient, [2] mint, [3] bondingCurve, 
    // [4] associatedBondingCurve, [5] associatedUser, [6] user, ...
    const mint = ix.accounts[2]?.toBase58();
    const bondingCurve = ix.accounts[3];
    const trader = ix.accounts[6]?.toBase58();

    if (!mint || !trader || !bondingCurve) {
      return null;
    }

    // Calculate SOL amount from balance changes
    const bondingCurveIndex = accountKeys.findIndex(
      (key) => key.pubkey.equals(bondingCurve)
    );

    let solAmount = 0;
    if (bondingCurveIndex !== -1 && tx.meta) {
      const preBalance = tx.meta.preBalances[bondingCurveIndex] || 0;
      const postBalance = tx.meta.postBalances[bondingCurveIndex] || 0;
      solAmount = Math.abs(postBalance - preBalance) / 1e9; // Convert lamports to SOL
    }

    // Calculate price (SOL per token)
    const price = tokenAmount > 0 ? solAmount / tokenAmount : 0;

    // Get timestamp
    const timestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();

    return {
      signature: tx.signature,
      mint,
      solAmount,
      tokenAmount,
      isBuy,
      trader,
      timestamp,
      price,
      slot: tx.slot,
    };
  }

  /**
   * Parse trades from transaction logs (alternative method)
   * Uses the TradeEvent emitted by the program
   */
  parseFromLogs(logs: string[], signature: string, slot: number): PumpFunTrade[] {
    const trades: PumpFunTrade[] = [];
    
    // Look for TradeEvent in logs
    // Format: "Program log: Trade: mint=..., solAmount=..., ..."
    for (const log of logs) {
      if (log.includes('TradeEvent') || log.includes('Program data:')) {
        // Parse base64 event data if present
        // This is more complex and requires anchor event parsing
        // For now, we rely on instruction parsing
      }
    }

    return trades;
  }
}

// === SINGLETON INSTANCE ===
let parserInstance: PumpFunParser | null = null;

export function getPumpFunParser(): PumpFunParser {
  if (!parserInstance) {
    parserInstance = new PumpFunParser();
  }
  return parserInstance;
}