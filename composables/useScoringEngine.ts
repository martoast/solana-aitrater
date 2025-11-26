/**
 * SCORING ENGINE COMPOSABLE
 * 
 * Provides reactive access to scoring engines.
 * Allows switching between different strategies at runtime.
 */

import { ref, computed } from 'vue';
import type { ScoringEngine, TokenData, BotSettings, ScoringResult } from '~/types/trading';
import { getScoringEngine, listScoringEngines, DEFAULT_ENGINE } from './scoring';

// === STATE ===
const currentEngineName = ref<string>(DEFAULT_ENGINE);

export function useScoringEngine() {
  // === CURRENT ENGINE ===
  const currentEngine = computed<ScoringEngine>(() => {
    return getScoringEngine(currentEngineName.value);
  });

  // === ENGINE INFO ===
  const engineName = computed(() => currentEngine.value.name);
  const engineVersion = computed(() => currentEngine.value.version);
  const engineDescription = computed(() => currentEngine.value.description);

  // === AVAILABLE ENGINES ===
  const availableEngines = computed(() => listScoringEngines());

  // === SWITCH ENGINE ===
  function setEngine(engineId: string): boolean {
    const engine = getScoringEngine(engineId);
    if (engine) {
      currentEngineName.value = engineId;
      console.log(`[ScoringEngine] Switched to: ${engine.name} v${engine.version}`);
      return true;
    }
    return false;
  }

  // === SCORING METHODS ===
  function classify(token: TokenData, settings: BotSettings): 'newborn' | 'established' | 'reject' {
    return currentEngine.value.classify(token, settings);
  }

  function calculateScore(token: TokenData, settings: BotSettings): ScoringResult {
    return currentEngine.value.calculateScore(token, settings);
  }

  // === PERSISTENCE ===
  function saveEnginePreference(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('scoring_engine', currentEngineName.value);
    }
  }

  function loadEnginePreference(): void {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('scoring_engine');
      if (saved && getScoringEngine(saved)) {
        currentEngineName.value = saved;
      }
    }
  }

  // Load on init
  loadEnginePreference();

  return {
    // State
    currentEngineName,
    currentEngine,
    
    // Info
    engineName,
    engineVersion,
    engineDescription,
    availableEngines,
    
    // Actions
    setEngine,
    classify,
    calculateScore,
    saveEnginePreference,
    loadEnginePreference,
  };
}