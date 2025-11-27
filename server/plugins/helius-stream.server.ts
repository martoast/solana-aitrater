/**
 * Helius Stream Plugin
 */

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig();
  const apiKey = config.heliusApiKey as string;

  if (!apiKey) {
    console.log('[HeliusPlugin] No API key found, stream disabled');
    return;
  }

  console.log('[HeliusPlugin] ✅ API key found:', apiKey.slice(0, 8) + '...');
  console.log('[HeliusPlugin] Initializing stream...');
  
  initializeStream(apiKey);

  setTimeout(() => {
    console.log('[HeliusPlugin] 🚀 Starting WebSocket stream...');
    startStream();
  }, 3000);

  nitroApp.hooks.hook('close', () => {
    console.log('[HeliusPlugin] Shutting down...');
    stopStream();
    cleanupCandleEngine();
    cleanupTradeStore();
  });
});