/**
 * The six defensive actions for the grid scenario.
 *
 * Each is a spec the engine's resolver consumes:
 *   { order, key, name, cost, hint, guard(run, node) -> boolean, apply(run, node, api) }
 *
 * `guard` must be pure — the UI calls it every frame via the engine's canApply.
 * `apply` mutates and emits log lines through `api.emit(type, message)`.
 *
 * These live with the scenario rather than in the engine on purpose: their guards
 * read scenario state and their log lines carry scenario vocabulary. Once a
 * second scenario exists we will know which parts are genuinely shared and can
 * lift a default set into the engine.
 *
 * Note that isolate is free — and it is the only action that takes a node off the
 * grid. On a hub that is catastrophic, which is what makes the free price a trap
 * rather than a dominant move.
 */

export const HARDEN_CAP = 3;
export const FIREWALL_SECONDS = 12;
export const ISOLATION_SECONDS = 10;
export const HUNT_BONUS = 50;

export const ACTIONS = {
  harden: {
    order: 1,
    key: '1',
    name: 'Harden',
    cost: 20,
    hint: `-20 · slows threats, max ${HARDEN_CAP}`,
    guard: (run, node) => node.online && node.hardening < HARDEN_CAP,
    apply: (run, node, api) => {
      node.hardening += 1;
      api.emit('ok', `Hardened ${node.name} (level ${node.hardening})`, 'ui');
    }
  },

  ratelimit: {
    order: 2,
    key: '2',
    name: 'Rate-limit',
    cost: 15,
    hint: `-15 · blocks ${FIREWALL_SECONDS}s`,
    guard: (run, node) => node.online,
    apply: (run, node, api) => {
      node.firewall = FIREWALL_SECONDS;
      api.emit('ok', `Rate-limit up on ${node.name}`, 'ui');
    }
  },

  hunt: {
    order: 3,
    key: '3',
    name: 'Hunt',
    cost: 20,
    hint: `-20 · remove threat, +${HUNT_BONUS} score`,
    guard: (run, node) => node.online && !!node.threat,
    apply: (run, node, api) => {
      api.emit('ok', `Threat hunted down on ${node.name} (+${HUNT_BONUS})`, 'contained');
      node.threat = null;
      run.kills += 1;
      run.score += HUNT_BONUS;
    }
  },

  segment: {
    order: 4,
    key: '4',
    name: 'Segment',
    cost: 10,
    hint: '-10 · stops lateral movement',
    guard: (run, node) => node.online && !node.segmented,
    apply: (run, node, api) => {
      node.segmented = true;
      api.emit('ok', `Segmented ${node.name} — lateral movement blocked`, 'contained');
    }
  },

  isolate: {
    order: 5,
    key: '5',
    name: 'Isolate',
    cost: 0,
    hint: `free · purge + dark ${ISOLATION_SECONDS}s`,
    guard: (run, node) => node.online,
    apply: (run, node, api) => {
      node.online = false;
      node.isolation = ISOLATION_SECONDS;
      node.threat = null;
      api.emit('ok', `Isolated ${node.name} — threat purged, node dark for ${ISOLATION_SECONDS}s`, 'contained');
    }
  },

  restore: {
    order: 6,
    key: '6',
    name: 'Restore',
    cost: 30,
    hint: '-30 · bring back online',
    guard: (run, node) => !node.online,
    apply: (run, node, api) => {
      node.online = true;
      node.threat = null;
      api.emit('ok', `Restored ${node.name}`, 'ui');
    }
  }
};

/** Action ids in display order. */
export const ACTION_ORDER = Object.keys(ACTIONS).sort(
  (a, b) => ACTIONS[a].order - ACTIONS[b].order
);
