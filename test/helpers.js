/** Shared test helpers: headless policies for driving the engine. */

import { createState, step, applyAction, ACTION_ORDER } from '../src/sim.js';

/**
 * Run a simulation headlessly under a policy.
 *
 * @param {object} opts
 * @param {number} opts.seed
 * @param {(state:any)=>void} [opts.policy] called once per tick, may act
 * @param {number} [opts.maxSeconds] hard stop
 * @param {number} [opts.dt]
 */
export function simulate({ seed, policy = () => {}, maxSeconds = 600, dt = 0.1 }) {
  const state = createState(undefined, seed);
  const ticks = Math.ceil(maxSeconds / dt);
  for (let i = 0; i < ticks && state.status === 'running'; i++) {
    if (policy) policy(state);
    step(state, dt);
  }
  return state;
}

/** Act on every node currently holding a threat, using `actionId`. */
export function actOnThreats(state, actionId) {
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.threat) applyAction(state, id, actionId);
  }
}

/** Restore anything that is offline, if affordable. */
export function restoreAll(state) {
  for (const id in state.nodes) {
    if (!state.nodes[id].online) applyAction(state, id, 'restore');
  }
}

/** A reasonably competent player: hunt live threats, restore blackouts. */
export function competentPolicy(state) {
  actOnThreats(state, 'hunt');
  restoreAll(state);
}

/**
 * Aggregate a metric over many seeds — the simulation is stochastic, so every
 * difficulty assertion is made on a mean rather than a single lucky run.
 */
export function meanOver(seeds, metric) {
  const vals = seeds.map(metric);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Seeds 1..n */
export function seeds(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export { createState, step, applyAction, ACTION_ORDER };
