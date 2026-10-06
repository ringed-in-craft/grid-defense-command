/**
 * An engine test fixture: a small ORCHARD.
 *
 * This is deliberately not a security scenario and not a power grid. It exists
 * to prove the engine is genuinely scenario-agnostic: if a blight spreading
 * across fruit trees runs on the same machinery as spearphishing across a
 * substation mesh, then the engine knows about graphs, dwell, cost and
 * objectives — and nothing about either domain.
 *
 * Domain vocabulary here is entirely different on purpose: producers, relays,
 * crops, a sun that is neither attackable nor defendable, "trimming" instead of
 * "hardening", "spraying" instead of "rate-limiting".
 */

/** Flow: fraction of crop weight reachable from a healthy producer. */
export function orchardFlow(run) {
  const nodes = run.nodes;
  for (const id in nodes) nodes[id].powered = false;

  /** @type {string[]} */
  const queue = [];
  for (const id in nodes) {
    if (nodes[id].type === 'producer' && nodes[id].online) {
      nodes[id].powered = true;
      queue.push(id);
    }
  }

  while (queue.length) {
    const cur = queue.pop();
    for (const nid of run.adj[cur]) {
      const o = nodes[nid];
      if (o.powered || !o.online) continue;
      if (o.type === 'sun') continue; // the sun is not a conduit
      o.powered = true;
      if (o.type !== 'crop') queue.push(nid);
    }
  }

  let served = 0;
  let total = 0;
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type !== 'crop') continue;
    total += n.weight;
    if (n.powered && n.online) served += n.weight;
  }
  return total ? served / total : 0;
}

export const ORCHARD_ACTIONS = {
  trim: {
    order: 1,
    key: '1',
    name: 'Trim',
    cost: 5,
    hint: '-5 · slows blight, max 2',
    guard: (run, n) => n.online && n.trims < 2,
    apply: (run, n, api) => {
      n.trims += 1;
      api.emit('ok', `Trimmed ${n.name} (${n.trims})`);
    }
  },
  spray: {
    order: 2,
    key: '2',
    name: 'Spray',
    cost: 3,
    hint: '-3 · blocks 4s',
    guard: (run, n) => n.online,
    apply: (run, n, api) => {
      n.sprayed = 4;
      api.emit('ok', `Sprayed ${n.name}`);
    }
  },
  clear: {
    order: 3,
    key: '3',
    name: 'Clear',
    cost: 0,
    hint: 'free · fells the tree, no recovery timer',
    guard: (run, n) => n.online,
    apply: (run, n, api) => {
      n.online = false;
      n.threat = null;
      api.emit('ok', `Cleared ${n.name}`);
    }
  },
  revive: {
    order: 4,
    key: '4',
    name: 'Revive',
    cost: 10,
    hint: '-10 · bring back',
    guard: (run, n) => !n.online,
    apply: (run, n, api) => {
      n.online = true;
      n.threat = null;
      api.emit('ok', `Revived ${n.name}`);
    }
  }
};

export const ORCHARD_PACK = {
  id: 'orchard',
  name: 'Orchard (engine fixture)',
  theme: 'orchard',
  topology: {
    assets: [
      { id: 'SUN', name: 'Sun', type: 'sun', x: 0.05, y: 0.5 },
      { id: 'T1', name: 'Tree 1', type: 'producer', x: 0.3, y: 0.25 },
      { id: 'T2', name: 'Tree 2', type: 'producer', x: 0.3, y: 0.75 },
      { id: 'P', name: 'Pump', type: 'relay', x: 0.55, y: 0.5 },
      { id: 'F1', name: 'Fruit A', type: 'crop', x: 0.85, y: 0.25, weight: 1 },
      { id: 'F2', name: 'Fruit B', type: 'crop', x: 0.85, y: 0.75, weight: 3 }
    ],
    links: [
      ['SUN', 'T1'], ['SUN', 'T2'], ['T1', 'P'], ['T2', 'P'], ['P', 'F1'], ['P', 'F2']
    ]
  },
  threats: {
    blight: { name: 'Blight', rate: 10, spreads: true, targets: '*', brief: 'blight briefing' },
    pest: { name: 'Pest', rate: 5, spreads: false, targets: ['relay'], brief: 'pest briefing' }
  },
  threatUnlocks: [{ id: 'blight', at: 0 }, { id: 'pest', at: 5 }],
  actions: ORCHARD_ACTIONS,
  flow: orchardFlow,
  // No `senses` on purpose: the engine must default to "not blind".
  config: {
    state: {
      counters: ['trims'],
      timers: ['sprayed'],
      flags: ['fenced'],
      undefendableTypes: ['sun'],
      unattackableTypes: ['sun'],
      onExpire: {
        sprayed: { emit: { type: 'ok', message: '{name} spray dried off' } }
      }
    },
    resources: { budget: { start: 30, perSecond: 1, cap: 45 } },
    objective: { scoreRate: 1, lossBelow: 0.5, lostMessage: 'Orchard lost' },
    blindPenalty: 2,
    spawn: {
      initialDelay: 1,
      base: 5,
      rampDivisor: 30,
      floor: 1,
      jitterMin: 0.9,
      jitterRange: 0.2,
      doubleAfter: 9999,
      doubleChance: 0,
      origin: 'SUN',
      shrugOff: { field: 'trims', levels: 2, chance: 1, label: 'trimmed' }
    },
    dwell: {
      mitigations: [{ field: 'trims', penalty: 0.5 }],
      blockerField: 'sprayed',
      containField: 'fenced',
      spreadAfterProgress: 10,
      spreadChancePerSecond: 1
    },
    traffic: { speed: 1 }
  }
};

/**
 * Build a pack with overrides, preserving the solver functions.
 *
 * Top-level keys replace pack fields; a `config` override is merged one level
 * deep. (A JSON round-trip clone would strip `flow`/`actions`, which is exactly
 * the footgun this helper exists to avoid.)
 */
export function packWith(overrides = {}) {
  const { config, ...rest } = overrides;
  return {
    ...ORCHARD_PACK,
    ...rest,
    config: { ...ORCHARD_PACK.config, ...(config || {}) }
  };
}
