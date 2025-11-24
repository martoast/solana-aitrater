<script setup lang="ts">
import { onMounted } from 'vue'
import { useTrader } from '~/composables/useTrader'

const { balance, fetchBalance, handleAirdrop, airdropping, network } = useTrader()

onMounted(() => {
  fetchBalance()
})
</script>

<!-- Template remains same -->
<template>
  <div class="max-w-lg mx-auto space-y-6 p-6">
    <div class="bg-black/20 p-10 rounded-xl border border-slate-600 text-center">
        <p class="text-slate-400 text-sm uppercase tracking-widest">Balance</p>
        <h2 class="text-5xl font-bold text-white mt-2">{{ balance?.toFixed(4) }} <span class="text-2xl text-purple-400">SOL</span></h2>
        <p class="text-xs text-slate-600 mt-2">{{ network }}</p>
    </div>
    <div class="grid grid-cols-1 gap-4">
      <button @click="fetchBalance" class="py-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold transition-colors">Refresh Balance</button>
      <button v-if="network === 'devnet'" @click="handleAirdrop" :disabled="airdropping" class="py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl font-bold text-black transition-colors flex items-center justify-center gap-2">
        <span v-if="airdropping" class="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full"></span>
        {{ airdropping ? 'Airdropping...' : 'Request 1 SOL Faucet' }}
      </button>
    </div>
  </div>
</template>