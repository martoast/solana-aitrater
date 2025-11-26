/**
 * SCORING ENGINE REGISTRY
 * 
 * This file exports all available scoring engines.
 * To add a new engine:
 * 1. Create a new file in this directory (e.g., momentum-v2.ts)
 * 2. Implement the ScoringEngine interface
 * 3. Export it from this file
 */

import type { ScoringEngine } from '~/types/trading';
import { ScalpingV1Engine } from './scalping-v1';

// === AVAILABLE ENGINES ===
export const SCORING_ENGINES: Record<string, ScoringEngine> = {
  'scalping-v1': ScalpingV1Engine,
  // Add more engines here:
  // 'momentum-v2': MomentumV2Engine,
  // 'conservative-v1': ConservativeV1Engine,
};

// === DEFAULT ENGINE ===
export const DEFAULT_ENGINE = 'scalping-v1';

// === GET ENGINE BY NAME ===
export function getScoringEngine(name: string): ScoringEngine {
  const engine = SCORING_ENGINES[name];
  if (!engine) {
    console.warn(`Scoring engine "${name}" not found, using default`);
    return SCORING_ENGINES[DEFAULT_ENGINE];
  }
  return engine;
}

// === LIST ALL ENGINES ===
export function listScoringEngines(): Array<{ id: string; name: string; description: string }> {
  return Object.entries(SCORING_ENGINES).map(([id, engine]) => ({
    id,
    name: engine.name,
    description: engine.description,
  }));
}

// Re-export engines for direct import
export { ScalpingV1Engine } from './scalping-v1';