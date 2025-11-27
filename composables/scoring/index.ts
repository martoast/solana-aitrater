/**
 * SCORING ENGINE REGISTRY
 * 
 * All available scoring engines are registered here.
 * 
 * To add a new engine:
 * 1. Create a new file in this directory (e.g., my-strategy.ts)
 * 2. Implement the ScoringEngine interface from ~/types/trading
 * 3. Import it below
 * 4. Add it to the SCORING_ENGINES object
 * 5. The engine will automatically appear in the UI
 */

import type { ScoringEngine } from '~/types/trading';

import { MemecoinSniperV1Engine } from './memecoin-sniper-v1';

// === AVAILABLE ENGINES ===
export const SCORING_ENGINES: Record<string, ScoringEngine> = {
  'memecoin-sniper-v1': MemecoinSniperV1Engine,
};

// === DEFAULT ENGINE ===
export const DEFAULT_ENGINE = 'memecoin-sniper-v1';

// === GET ENGINE BY NAME ===
export function getScoringEngine(name: string): ScoringEngine {
  const engine = SCORING_ENGINES[name];
  if (!engine) {
    console.warn(`[ScoringEngine] Engine "${name}" not found, using default: ${DEFAULT_ENGINE}`);
    return SCORING_ENGINES[DEFAULT_ENGINE];
  }
  return engine;
}

// === LIST ALL ENGINES ===
export function listScoringEngines(): Array<{ 
  id: string; 
  name: string; 
  version: string;
  description: string;
}> {
  return Object.entries(SCORING_ENGINES).map(([id, engine]) => ({
    id,
    name: engine.name,
    version: engine.version,
    description: engine.description,
  }));
}

// === GET ENGINE COUNT ===
export function getEngineCount(): number {
  return Object.keys(SCORING_ENGINES).length;
}

// === CHECK IF ENGINE EXISTS ===
export function engineExists(name: string): boolean {
  return name in SCORING_ENGINES;
}

// === RE-EXPORT INDIVIDUAL ENGINES ===
export { MemecoinSniperV1Engine } from './memecoin-sniper-v1';