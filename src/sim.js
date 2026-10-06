/**
 * Public API facade.
 *
 * This module is the boundary the rest of the app (and the test suite) uses. It
 * exists so that the engine extraction in M1 was provably behaviour-preserving:
 * the exported surface is unchanged, so every pre-existing test passes without
 * modification, which is the evidence that nothing moved semantically.
 *
 * Underneath, it is now:
 *   src/engine/     scenario-agnostic machinery (graph, threats, actions, run)
 *   src/scenario/   the grid game as data + two solver functions
 *
 * In M2 this file will resolve `engine` from a vendored, hash-locked engine
 * release instead of from ./engine/, and the surface below will not change.
 *
 * @module sim
 */

import { createRun } from './engine/run.js';
import { GRID_PACK } from './scenario/grid/index.js';

export { createRun, step, applyAction, canApply, ENGINE_VERSION } from './engine/run.js';

export {
  // scenario data
  HARBOR_REGION,
  SCENARIOS,
  DEFAULT_SCENARIO,
  THREATS,
  THREAT_UNLOCKS,
  ACTIONS,
  ACTION_ORDER,
  // scenario solvers
  powerFlow,
  isBlind,
  // scenario tuning constants
  BLIND_PENALTY,
  LOSS_THRESHOLD,
  BUDGET_START,
  BUDGET_PER_SECOND,
  BUDGET_CAP,
  HARDEN_CAP,
  HARDEN_DWELL_PENALTY,
  FIREWALL_SECONDS,
  ISOLATION_SECONDS,
  HUNT_BONUS
} from './scenario/grid/index.js';

/**
 * Build a fresh run.
 *
 * Accepts either a scenario pack (which is what the app passes) or anything else
 * — including the legacy `undefined` used throughout the tests — in which case
 * the default scenario is used. That leniency is deliberate: it keeps the
 * historical call signature working without the tests needing to change.
 *
 * @param {any} [scenario] a scenario pack, or falsy for the default
 * @param {number} [seed]
 */
export function createState(scenario, seed = 1) {
  const pack = scenario && scenario.topology ? scenario : GRID_PACK;
  return createRun(pack, seed);
}
