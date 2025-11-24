<script setup lang="ts">
import { useTrader } from '~/composables/useTrader'
import { WalletMultiButton } from 'solana-wallets-vue'

// Access the Singleton state
const { 
  activeTab, aiAnalysis, manageAdvice, showBuyModal, 
  selectedToken, buyAmount, isBuying, openBuyModal, executeBuy, 
  closePosition, activeTrades 
} = useTrader()
</script>

<template>
  <div class="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden min-h-[600px] flex flex-col relative">
    
    <!-- === GLOBAL MODALS === -->
    
    <!-- 1. BUY MODAL -->
    <div v-if="showBuyModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-600 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in">
        <div class="flex justify-between items-start mb-6">
          <div class="flex items-center gap-3">
            <img v-if="selectedToken.logoURI" :src="selectedToken.logoURI" class="w-12 h-12 rounded-full bg-black" />
            <div>
              <h3 class="text-xl font-bold text-white">Buy {{ selectedToken.symbol }}</h3>
              <p class="text-xs text-slate-400 font-mono">${{ selectedToken.price?.toFixed(8) }}</p>
            </div>
          </div>
          <button @click="showBuyModal = false" class="text-slate-500 hover:text-white text-2xl">&times;</button>
        </div>
        <div class="mb-6">
          <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Investment Amount (USD)</label>
          <div class="relative">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input type="number" v-model="buyAmount" class="w-full bg-slate-800 border border-slate-600 rounded-xl py-4 pl-8 pr-4 text-2xl font-bold text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"/>
          </div>
          <div class="flex gap-2 mt-3">
            <button @click="buyAmount = 10" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 10 ? 'border-green-500 text-green-400' : ''">$10</button>
            <button @click="buyAmount = 50" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 50 ? 'border-green-500 text-green-400' : ''">$50</button>
            <button @click="buyAmount = 100" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-bold transition-colors" :class="buyAmount === 100 ? 'border-green-500 text-green-400' : ''">$100</button>
          </div>
        </div>
        <div class="bg-black/20 rounded-lg p-4 mb-6 border border-slate-800">
          <div class="flex justify-between mb-2"><span class="text-sm text-slate-400">Est. Tokens</span><span class="text-sm font-mono text-white">{{ (buyAmount / selectedToken.price).toLocaleString() }} {{ selectedToken.symbol }}</span></div>
          <div class="flex justify-between"><span class="text-sm text-slate-400">Mode</span><span class="text-sm font-bold text-yellow-400">SIMULATION</span></div>
        </div>
        <button @click="executeBuy" :disabled="isBuying" class="w-full py-4 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-400 text-black transition-all shadow-lg shadow-green-900/20 disabled:opacity-50">{{ isBuying ? 'Executing...' : `Confirm Buy ($${buyAmount})` }}</button>
      </div>
    </div>

    <!-- 2. MANAGER ADVICE MODAL -->
    <div v-if="manageAdvice" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-blue-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in relative">
        <button @click="manageAdvice = null" class="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold text-white">Manager: {{ manageAdvice.symbol }}</h3>
            <p class="text-sm text-blue-300">Position Strategy</p>
          </div>
          <div class="px-4 py-2 rounded-lg font-bold text-xl border" 
               :class="manageAdvice.decision === 'SELL' ? 'bg-red-500 text-white border-red-400' : 'bg-blue-500 text-black border-blue-400'">
            {{ manageAdvice.decision }} ({{ manageAdvice.confidence }}%)
          </div>
        </div>
        <p class="text-slate-300 italic mb-6 text-lg leading-relaxed">"{{ manageAdvice.reasoning }}"</p>
        <div class="flex gap-4">
          <button v-if="manageAdvice.decision === 'SELL'" @click="closePosition(activeTrades.find(t => t.id === manageAdvice.tradeId))" class="flex-1 py-3 rounded-lg font-bold bg-red-500 hover:bg-red-400 text-white">Execute SELL</button>
          <button @click="manageAdvice = null" class="flex-1 py-3 rounded-lg font-bold bg-slate-700 hover:bg-slate-600">Keep Holding</button>
        </div>
      </div>
    </div>

    <!-- 3. AI ANALYSIS POPUP -->
    <div v-if="aiAnalysis" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-purple-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in relative">
        <button @click="aiAnalysis = null" class="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold text-white">Analysis: ${{ aiAnalysis.token.symbol }}</h3>
            <p class="text-sm text-purple-300">Gemini Risk Engine</p>
          </div>
          <div class="px-4 py-2 rounded-lg font-bold text-xl border" :class="aiAnalysis.decision === 'BUY' ? 'bg-green-500 text-black border-green-400' : (aiAnalysis.decision === 'AVOID' ? 'bg-red-500 text-white border-red-400' : 'bg-yellow-500 text-black border-yellow-400')">{{ aiAnalysis.decision }} ({{ aiAnalysis.confidence }}%)</div>
        </div>
        <p class="text-slate-300 italic mb-6 text-lg leading-relaxed">"{{ aiAnalysis.reasoning }}"</p>
        <div class="flex gap-4" v-if="aiAnalysis.decision !== 'AVOID'">
          <button @click="openBuyModal(aiAnalysis.token)" class="flex-1 py-3 rounded-lg font-bold bg-green-500 hover:bg-green-400 text-black transition-transform hover:scale-[1.02]">🚀 Trade Now</button>
        </div>
      </div>
    </div>

    <!-- HEADER -->
    <div class="p-6 border-b border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50">
      <div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          AITrader <span class="text-xs bg-slate-700 text-white px-2 py-0.5 rounded uppercase ml-2">SIMULATION</span>
        </h1>
      </div>
      <WalletMultiButton dark />
    </div>

    <!-- TABS NAVIGATION -->
    <div class="flex border-b border-slate-700 bg-slate-800 overflow-x-auto">
      <button @click="activeTab = 'hunter'" class="flex-1 py-4 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap" :class="activeTab === 'hunter' ? 'bg-slate-700 text-white border-purple-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'">💎 Gem Hunter</button>
      <button @click="activeTab = 'positions'" class="flex-1 py-4 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap" :class="activeTab === 'positions' ? 'bg-slate-700 text-white border-purple-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'">📈 Portfolio</button>
      <button @click="activeTab = 'wallet'" class="flex-1 py-4 px-4 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap" :class="activeTab === 'wallet' ? 'bg-slate-700 text-white border-purple-500' : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'">💳 Wallet</button>
    </div>

    <!-- DYNAMIC CONTENT -->
    <div class="p-6 flex-1 bg-slate-800">
      <TraderHunter v-if="activeTab === 'hunter'" />
      <TraderPortfolio v-if="activeTab === 'positions'" />
      <TraderWallet v-if="activeTab === 'wallet'" />
    </div>

  </div>
</template>