<!-- pages/index.vue -->
<script setup lang="ts">
import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { initWallet } from 'solana-wallets-vue'
import 'solana-wallets-vue/styles.css'

const walletOptions = {
  wallets: [ new PhantomWalletAdapter() ],
  autoConnect: true,
}
initWallet(walletOptions)
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <TraderInterface />
    </div>
  </div>
</template>