// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss'
  ],
  runtimeConfig: {
    // Private Keys (Server side only)
    birdEyeApiKey: process.env.NUXT_BIRDEYE_API_KEY,
    geminiApiKey: process.env.NUXT_GEMINI_API_KEY,
    
    // Public Keys (Client side)
    public: {
      solanaNetwork: process.env.NUXT_PUBLIC_SOLANA_NETWORK || 'devnet',
      solanaRpcHost: process.env.NUXT_PUBLIC_SOLANA_RPC_HOST,
    }
  }
})