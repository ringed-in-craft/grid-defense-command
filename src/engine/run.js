/**
 * The run loop: create, step, resolve.
 *
 * This is the engine's entry point and the only module that orchestrates. It
 * knows about time, resources, threats, actions and the objective, and nothing
 * about power grids, ransomware or analysts.
 *
 * A scenario supplies a *pack*:
 *
 *   {
 *     topology:      { assets, links }
 *     threats:       { id -> { name, rate, spreads, targets, brief } }
 *     threatUnlocks: [ { id, at } ]
 *     actions:       { id -> { order, key, name, cost, hint, guard, apply } }
 *     flow:          (run) => number in 0..1, sets derived per-node state
 *     senses?:       (run) => boolean      // operator blindness
 *     config:        numbers for dwell, spawn, resources, objective, state
 *   }
 *
 * Time is simulated by the caller: pass `dt` in seconds, call as fast or slow as
 * you like, and the result for a given seed is identical.
 *
 * Random-call ORDER is part of the contract. The sequence below is preserved
 * from the original prototype so that existing runs reproduce exactly, and the
 * determinism tests pin it.
 */

import { mulberry32 } from './rng.js';
import { buildGraph, advanceTraffic } from './graph.js';
import { event } from './events.js';
import { regenBudget } from './resources.js';
import { accrueScore, isLost } from './objective.js';
import { spawnThreat, advanceThreat } from './threats.js';
import { resolveAction, canResolve, orderActions } from './actions.js';

export const ENGINE_VERSION = '0.1.0';

/**
 * Build a fresh run from a scenario pack.
 * @param {any} pack
 * @param {number} [seed]
 * @returns {any} run state
 */
export function createRun(pack, seed = 1) {
  const config = pack.config;
  const { nodes, adj } = buildGraph(pack.topology.assets, pack.topology.links, config.state);

  const run = {
    pack,
    config,
    seed,
    rng: mulberry32(seed),

    // graph
    nodes,
    adj,
    links: pack.topology.links,

    // clock and outcome
    t: 0,
    status: /** @type {'running'|'lost'} */ ('running'),
    service: 1,
    score: 0,

    // player resources
    budget: config.resources.budget.start,

    // threat scheduling
    spawnTimer: config.spawn.initialDelay,
    seen: /** @type {Record<string, 1>} */ ({}),
    kills: 0,
    blackouts: 0,

    // operator state
    blind: false,

    /** Purely cosmetic attack-traffic marks. The simulation never reads these. */
    packets: /** @type {{from:string,to:string,t:number}[]} */ ([]),

    events: /** @type {import('./events.js').SimEvent[]} */ ([])
  };

  run.service = pack.flow(run);
  run.blind = pack.senses ? pack.senses(run) : false;
  return run;
}

/**
 * Advance the run by `dt` seconds.
 * @param {any} run
 * @param {number} dt
 * @returns {import('./events.js').SimEvent[]}
 */
export function step(run, dt) {
  if (run.status !== 'running' || dt <= 0) return [];

  const events = [];
  const config = run.config;

  run.t += dt;
  regenBudget(run, dt);
  advanceTraffic(run, dt);

  // --- attack scheduling ----------------------------------------------------
  // Ramps up over time and occasionally double-seeds after a while, so the
  // difficulty curve is mounting pressure rather than a plateau.
  const spawn = config.spawn;
  run.spawnTimer -= dt;
  if (run.spawnTimer <= 0) {
    events.push(...spawnThreat(run));
    if (run.t > spawn.doubleAfter && run.rng() < spawn.doubleChance) {
      events.push(...spawnThreat(run));
    }
    run.spawnTimer =
      Math.max(spawn.floor, spawn.base - run.t / spawn.rampDivisor) *
      (spawn.jitterMin + run.rng() * spawn.jitterRange);
  }

  // Blindness is read from the *previous* tick's flow result, which is what the
  // prototype did; the flow is recomputed at the end of this tick.
  const blind = run.pack.senses ? run.pack.senses(run) : false;
  run.blind = blind;

  // --- per-node resolution --------------------------------------------------
  for (const id in run.nodes) {
    const node = run.nodes[id];

    // effect timers (firewall, isolation, ...) declared by the scenario
    for (const field of config.state.timers || []) {
      if (node[field] <= 0) continue;
      node[field] = Math.max(0, node[field] - dt);
      if (node[field] !== 0) continue;
      const rule = config.state.onExpire?.[field];
      if (!rule) continue;
      if (rule.set) Object.assign(node, rule.set);
      if (rule.emit) {
        events.push(
          event(rule.emit.type, node.id, rule.emit.message.replace('{name}', node.name), rule.emit.cue ?? null)
        );
      }
    }

    // threat dwell, spread and completion
    if (node.threat && node.online) {
      events.push(...advanceThreat(run, node, dt, blind));
    }
  }

  // --- service level, scoring and loss --------------------------------------
  run.service = run.pack.flow(run);
  accrueScore(run, dt);

  if (isLost(run)) {
    run.status = 'lost';
    events.push(event('bad', null, config.objective.lostMessage, 'lost'));
  }

  run.events = events;
  return events;
}

/**
 * Apply a defender action. Thin re-export so the engine has one public surface.
 * @param {any} run
 * @param {string|null} nodeId
 * @param {string} actionId
 */
export function applyAction(run, nodeId, actionId) {
  return resolveAction(run, nodeId, actionId);
}

/**
 * @param {any} run
 * @param {string|null} nodeId
 * @param {string} actionId
 * @returns {boolean}
 */
export function canApply(run, nodeId, actionId) {
  return canResolve(run, nodeId, actionId);
}

/** Re-exported convenience for presentation layers. */
export { orderActions };
