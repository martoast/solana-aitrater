/**
 * Helius Stream Plugin (Nitro)
 * 
 * Starts the PumpFun WebSocket stream when the Nuxt server boots.
 */

import { initializeStream, startStream, stopStream } from '../utils/helius-stream';
import { cleanup as cleanupCandles } from '../utils/candle-engine';
import { cleanup as cleanupTrades } from '../utils/trade-store';

export default defineNitroPlugin((nitroApp) => {
  // Log immediately to confirm plugin loads
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║     HELIUS STREAM PLUGIN LOADING       ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');

  // Get config
  const config = useRuntimeConfig();
  
  // Debug logging
  console.log('[HeliusPlugin] Checking for API key...');
  console.log('[HeliusPlugin] heliusApiKey exists:', !!config.heliusApiKey);
  
  const apiKey = config.heliusApiKey as string;

  if (!apiKey) {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║  ⚠️  NO HELIUS API KEY FOUND!          ║');
    console.log('║                                        ║');
    console.log('║  Set NUXT_HELIUS_API_KEY in .env      ║');
    console.log('║  Stream will NOT start.               ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    return;
  }

  console.log('[HeliusPlugin] ✅ API key found:', apiKey.substring(0, 8) + '...');
  console.log('[HeliusPlugin] Initializing stream...');
  
  // Initialize the stream
  initializeStream(apiKey);
  
  // Start after a short delay to let everything initialize
  setTimeout(() => {
    console.log('[HeliusPlugin] 🚀 Starting WebSocket stream...');
    startStream();
  }, 3000);

  // Cleanup timer - runs every 5 minutes
  const cleanupTimer = setInterval(() => {
    const candlesRemoved = cleanupCandles(30 * 60 * 1000);
    const tradesRemoved = cleanupTrades(30 * 60 * 1000);
    
    if (candlesRemoved > 0 || tradesRemoved > 0) {
      console.log(`[HeliusPlugin] 🧹 Cleanup: ${candlesRemoved} candle stores, ${tradesRemoved} trade stores removed`);
    }
  }, 5 * 60 * 1000);

  // Handle server shutdown
  nitroApp.hooks.hook('close', () => {
    console.log('[HeliusPlugin] 🛑 Server shutting down, stopping stream...');
    stopStream();
    clearInterval(cleanupTimer);
  });
});