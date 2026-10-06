/**
 * The simulation engine.
 *
 * Deliberately free of any DOM, canvas or timing reference: `step(state, dt)`
 * is a pure-ish state transition that returns a list of events, and randomness
 * only ever comes from `state.rng`. That is what allows the whole thing to run
 * headless in tests (see test/), and is the main structural change from the
 * original single-file prototype where simulation and rendering were entangled.
 *
 * Time is simulated by the caller: pass `dt` in seconds, call as fast or slow
 * as you like, and the result for a given seed is identical.
 */

import { mulberry32, pick } from './rng.js';
import { THREATS, THREAT_UNLOCKS } from './threats.js';
import { DEFAULT_SCENARIO } from './scenarios.js';

/**
 * Defender actions. `cost` is in Response Budget points.
 * Note that isolate is free — but it takes the node off the grid entirely,
 * so it is rarely actually free. That trade-off is the point.
 */
export const ACTIONS = {
  harden: { order: 1, key: '1', name: 'Harden', cost: 20, hint: '-20 · slows threats, max 3' },
  ratelimit: { order: 2, key: '2', name: 'Rate-limit', cost: 15, hint: '-15 · blocks 12s' },
  hunt: { order: 3, key: '3', name: 'Hunt', cost: 20, hint: '-20 · remove threat, +50 score' },
  segment: { order: 4, key: '4', name: 'Segment', cost: 10, hint: '-10 · stops lateral movement' },
  isolate: { order: 5, key: '5', name: 'Isolate', cost: 0, hint: 'free · purge + dark 10s' },
  restore: { order: 6, key: '6', name: 'Restore', cost: 30, hint: '-30 · bring back online' }
};

/** @typedef {keyof typeof ACTIONS} ActionId */

export const ACTION_ORDER = /** @type {ActionId[]} */ (
  Object.keys(ACTIONS).sort((a, b) => ACTIONS[a].order - ACTIONS[b].order)
);

export const HARDEN_CAP = 3;
export const FIREWALL_SECONDS = 12;
export const ISOLATION_SECONDS = 10;
export const BUDGET_CAP = 150;
export const BUDGET_PER_SECOND = 4;
export const BLIND_PENALTY = 1.5;
export const LOSS_THRESHOLD = 0.2;

/**
 * Build a fresh simulation state.
 * @param {import('./scenarios.js').Scenario} [scenario]
 * @param {number} [seed]
 */
export function createState(scenario = DEFAULT_SCENARIO, seed = 1) {
  /** @type {Record<string, any>} */
  const nodes = {};
  /** @type {Record<string, string[]>} */
  const adj = {};

  for (const n of scenario.nodes) {
    nodes[n.id] = {
      id: n.id,
      name: n.name,
      type: n.type,
      x: n.x,
      y: n.y,
      weight: n.weight || 0,
      hardening: 0,
      firewall: 0,
      isolation: 0,
      online: true,
      segmented: false,
      powered: false,
      threat: /** @type {{id: string, progress: number}|null} */ (null)
    };
    adj[n.id] = [];
  }
  for (const [a, b] of scenario.links) {
    adj[a].push(b);
    adj[b].push(a);
  }

  const state = {
    scenario,
    seed,
    rng: mulberry32(seed),
    nodes,
    adj,
    links: scenario.links,
    t: 0,
    budget: 100,
    score: 0,
    status: /** @type {'running'|'lost'} */ ('running'),
    service: 1,
    spawnTimer: 2.5,
    seen: /** @type {Record<string, 1>} */ ({}),
    kills: 0,
    blackouts: 0,
    /** Purely cosmetic attack-traffic dashes. Simulation never reads these. */
    packets: /** @type {{from:string,to:string,t:number}[]} */ ([]),
    events: /** @type {SimEvent[]} */ ([])
  };

  powerFlow(state);
  return state;
}

/** @typedef {{type:'bad'|'ok'|'learn', nodeId:string|null, message:string}} SimEvent */

/** @returns {SimEvent} */
function ev(type, nodeId, message) {
  return { type, nodeId, message };
}

/**
 * Compute which nodes are energised and what fraction of critical load is served.
 *
 * Generators energise their neighbours, substations relay, loads are sinks and
 * do not relay onward. The external network and the control centre never carry
 * power. The control centre *draws* power (it needs a live feed, which is what
 * `isBlind` keys off) but is not a conduit — routing power through a control
 * room to reach a city would not be physical.
 *
 * Mutates `node.powered` and returns served / total load weight.
 * @returns {number} service ratio in 0..1
 */
export function powerFlow(state) {
  const nodes = state.nodes;
  for (const id in nodes) nodes[id].powered = false;

  /** @type {string[]} */
  const queue = [];
  for (const id in nodes) {
    if (nodes[id].type === 'gen' && nodes[id].online) {
      nodes[id].powered = true;
      queue.push(id);
    }
  }

  while (queue.length) {
    const cur = queue.pop();
    for (const nid of state.adj[cur]) {
      const o = nodes[nid];
      if (o.powered || !o.online) continue;
      if (o.type === 'net' || o.type === 'soc') continue;
      o.powered = true;
      if (o.type !== 'load') queue.push(nid);
    }
  }

  // The control centre is powered if it has any live feed at all.
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type !== 'soc') continue;
    n.powered = n.online && state.adj[id].some((nid) => nodes[nid].powered);
  }

  let served = 0;
  let total = 0;
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type !== 'load') continue;
    total += n.weight;
    if (n.powered && n.online) served += n.weight;
  }
  return total ? served / total : 0;
}

/**
 * Truthful only while the control centre has power and is online. When blind,
 * threats run faster AND the UI stops reporting where they are — which is the
 * point of a denial-of-service against a control centre (ATT&CK T0832).
 * @returns {boolean}
 */
export function isBlind(state) {
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.type === 'soc') return !n.online || !n.powered;
  }
  return false;
}

/**
 * Seed one new threat somewhere valid for its type.
 * @returns {SimEvent[]}
 */
export function spawn(state) {
  const events = [];
  const available = THREAT_UNLOCKS.filter((u) => state.t >= u.at).map((u) => u.id);
  const id = /** @type {string} */ (pick(available, state.rng) || 'phish');
  const spec = THREATS[id];

  let candidates = Object.values(state.nodes).filter(
    (n) => n.type !== 'net' && n.online && !n.threat
  );
  if (spec.targets !== '*') candidates = candidates.filter((n) => spec.targets.includes(n.type));
  if (!candidates.length) return events;

  const target = /** @type {any} */ (pick(candidates, state.rng));

  // Hardening is a probabilistic, not absolute, defence — that is realistic.
  if (target.hardening >= HARDEN_CAP && state.rng() < 0.4) {
    events.push(ev('ok', target.id, `${target.name} shrugged off ${spec.name} (hardened)`));
    return events;
  }

  target.threat = { id, progress: 0 };
  state.packets.push({ from: 'INT', to: target.id, t: 0 });
  events.push(ev('bad', target.id, `${spec.name} hitting ${target.name}`));
  if (!state.seen[id]) {
    state.seen[id] = 1;
    events.push(ev('learn', target.id, spec.brief));
  }
  return events;
}

/**
 * Lateral movement. Blocked into/out of a segmented node and past a firewall.
 * @returns {SimEvent[]}
 */
function spread(state, from) {
  const events = [];
  if (!from.threat) return events;
  const spec = THREATS[from.threat.id];
  if (!spec.spreads || from.firewall > 0 || from.segmented) return events;

  const neighbours = state.adj[from.id].filter((nid) => {
    const m = state.nodes[nid];
    return m.type !== 'net' && m.online && !m.threat && m.firewall <= 0 && !m.segmented;
  });
  if (!neighbours.length) return events;

  const targetId = /** @type {string} */ (pick(neighbours, state.rng));
  const target = state.nodes[targetId];
  if (!target) return events;
  target.threat = { id: from.threat.id, progress: 0 };
  state.packets.push({ from: from.id, to: targetId, t: 0 });
  events.push(ev('bad', target.id, `${spec.name} spread to ${target.name}`));
  return events;
}

/**
 * Advance the simulation by `dt` seconds.
 * @param {any} state
 * @param {number} dt
 * @returns {SimEvent[]}
 */
export function step(state, dt) {
  if (state.status !== 'running' || dt <= 0) return [];

  const events = [];
  state.t += dt;
  state.budget = Math.min(BUDGET_CAP, state.budget + BUDGET_PER_SECOND * dt);

  // cosmetic traffic
  state.packets = state.packets.filter((p) => (p.t += dt * 1.6) < 1);

  // --- attack scheduling -----------------------------------------------------
  // Ramps up over time and occasionally double-spawns after 70s, so the
  // difficulty curve is pressure rather than a plateau.
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    events.push(...spawn(state));
    if (state.t > 70 && state.rng() < 0.4) events.push(...spawn(state));
    state.spawnTimer = Math.max(2, 7 - state.t / 22) * (0.8 + state.rng() * 0.4);
  }

  const blind = isBlind(state);

  // --- per-node resolution ---------------------------------------------------
  for (const id in state.nodes) {
    const n = state.nodes[id];

    if (n.firewall > 0) n.firewall = Math.max(0, n.firewall - dt);

    if (n.isolation > 0) {
      n.isolation = Math.max(0, n.isolation - dt);
      if (n.isolation === 0) {
        n.online = true;
        events.push(ev('ok', n.id, `${n.name} back online`));
      }
    }

    if (n.threat && n.online) {
      const spec = THREATS[n.threat.id];
      let rate = spec.rate * (1 - 0.25 * n.hardening) * (blind ? BLIND_PENALTY : 1);
      if (n.firewall > 0) rate = 0;
      n.threat.progress += rate * dt;

      if (spec.spreads && n.threat.progress > 25 && state.rng() < dt * 0.25) {
        events.push(...spread(state, n));
      }

      if (n.threat.progress >= 100) {
        n.online = false;
        n.threat = null;
        state.blackouts += 1;
        events.push(ev('bad', n.id, `${n.name} knocked offline`));
      }
    }
  }

  // --- service level & scoring ----------------------------------------------
  state.service = powerFlow(state);
  state.score += state.service * dt * 2;

  if (state.service < LOSS_THRESHOLD) {
    state.status = 'lost';
    events.push(ev('bad', null, 'Grid lost'));
  }

  state.events = events;
  return events;
}

/**
 * Apply a defender action to a node.
 *
 * Returns `{ok:false, reason}` rather than throwing, so the UI can simply
 * disable anything that would be rejected.
 *
 * @param {any} state
 * @param {string|null} nodeId
 * @param {ActionId} actionId
 * @returns {{ok:boolean, reason?:string, events:SimEvent[]}}
 */
export function applyAction(state, nodeId, actionId) {
  const fail = (reason) => ({ ok: false, reason, events: [] });
  if (state.status !== 'running') return fail('not-running');
  const n = nodeId ? state.nodes[nodeId] : null;
  if (!n) return fail('no-target');
  if (n.type === 'net') return fail('cannot-defend');

  const action = ACTIONS[actionId];
  if (!action) return fail('unknown-action');
  if (state.budget < action.cost) return fail('budget');

  const events = [];
  switch (actionId) {
    case 'harden':
      if (!n.online || n.hardening >= HARDEN_CAP) return fail('not-applicable');
      state.budget -= action.cost;
      n.hardening += 1;
      events.push(ev('ok', n.id, `Hardened ${n.name} (level ${n.hardening})`));
      break;

    case 'ratelimit':
      if (!n.online) return fail('not-applicable');
      state.budget -= action.cost;
      n.firewall = FIREWALL_SECONDS;
      events.push(ev('ok', n.id, `Rate-limit up on ${n.name}`));
      break;

    case 'hunt':
      if (!n.online || !n.threat) return fail('not-applicable');
      state.budget -= action.cost;
      events.push(ev('ok', n.id, `Threat hunted down on ${n.name} (+50)`));
      n.threat = null;
      state.kills += 1;
      state.score += 50;
      break;

    case 'segment':
      if (!n.online || n.segmented) return fail('not-applicable');
      state.budget -= action.cost;
      n.segmented = true;
      events.push(ev('ok', n.id, `Segmented ${n.name} — lateral movement blocked`));
      break;

    case 'isolate':
      if (!n.online) return fail('not-applicable');
      n.online = false;
      n.isolation = ISOLATION_SECONDS;
      n.threat = null;
      events.push(ev('ok', n.id, `Isolated ${n.name} — threat purged, node dark for ${ISOLATION_SECONDS}s`));
      break;

    case 'restore':
      if (n.online) return fail('not-applicable');
      state.budget -= action.cost;
      n.online = true;
      n.threat = null;
      events.push(ev('ok', n.id, `Restored ${n.name}`));
      break;

    default:
      return fail('unknown-action');
  }

  state.events = events;
  return { ok: true, events };
}

/**
 * Whether an action would currently be accepted — drives button disabled state.
 *
 * Read-only predicate: it must never mutate, because the UI evaluates it every
 * frame. Kept in sync with `applyAction`'s guards (asserted in test/actions).
 * @param {any} state
 * @param {string|null} nodeId
 * @param {ActionId} actionId
 * @returns {boolean}
 */
export function canApply(state, nodeId, actionId) {
  const action = ACTIONS[actionId];
  if (!action || state.status !== 'running') return false;
  const n = nodeId ? state.nodes[nodeId] : null;
  if (!n || n.type === 'net') return false;
  if (state.budget < action.cost) return false;

  switch (actionId) {
    case 'harden':
      return n.online && n.hardening < HARDEN_CAP;
    case 'ratelimit':
      return n.online;
    case 'hunt':
      return n.online && !!n.threat;
    case 'segment':
      return n.online && !n.segmented;
    case 'isolate':
      return n.online;
    case 'restore':
      return !n.online;
    default:
      return false;
  }
}
