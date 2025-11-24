<script setup lang="ts">
import { onMounted } from 'vue'
import { useTrader } from '~/composables/useTrader'

const { balance, fetchBalance, handleAirdrop, airdropping, network } = useTrader()

onMounted(() => {
  fetchBalance()
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6 p-6">
    <div class="bg-black/20 p-6 rounded-xl border border-slate-600 text-center">
        <p class="text-slate-400 text-sm">Devnet SOL Balance</p>
        <h2 class="text-4xl font-bold text-white mt-2">{{ balance?.toFixed(4) }} SOL</h2>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <button @click="fetchBalance" class="py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-colors">Refresh Balance</button>
      <button @click="handleAirdrop" :disabled="airdropping" class="py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
        <span v-if="airdropping" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
        {{ airdropping ? 'Airdropping...' : 'Faucet (+1 SOL)' }}
      </button>
    </div>
    <div class="text-center text-slate-500 text-xs">
       Only works on Devnet.
    </div>
  </div>
</template>