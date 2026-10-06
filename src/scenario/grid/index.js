/**
 * The grid scenario pack.
 *
 * A pack is the complete description of a game as far as the engine is
 * concerned: topology, threat catalogue, action set, the two solver functions
 * (flow and senses), and the numbers. The engine reads nothing else.
 *
 * Nothing in this file is engine code, and nothing in src/engine/ knows what a
 * substation is.
 */

import { HARBOR_REGION } from './topology.js';
import { THREATS, THREAT_UNLOCKS } from './threats.js';
import { powerFlow, isBlind } from './flow.js';
import { ACTIONS, ACTION_ORDER, HARDEN_CAP, FIREWALL_SECONDS, ISOLATION_SECONDS, HUNT_BONUS } from './actions.js';

export const BLIND_PENALTY = 1.5;
export const LOSS_THRESHOLD = 0.2;
export const BUDGET_START = 100;
export const BUDGET_PER_SECOND = 4;
export const BUDGET_CAP = 150;

/** How much a level of hardening shaves off the threat dwell rate. */
export const HARDEN_DWELL_PENALTY = 0.25;

export const GRID_CONFIG = {
  state: {
    counters: ['hardening'],
    timers: ['firewall', 'isolation'],
    flags: ['segmented'],
    undefendableTypes: ['net'],
    unattackableTypes: ['net'],
    onExpire: {
      // An isolated node comes back on its own. This is the only timer with an
      // expiry effect; the rate-limit timer just lapses.
      isolation: {
        set: { online: true },
        emit: { type: 'ok', message: '{name} back online' }
      }
    }
  },

  resources: {
    budget: { start: BUDGET_START, perSecond: BUDGET_PER_SECOND, cap: BUDGET_CAP }
  },

  objective: {
    scoreRate: 2,
    lossBelow: LOSS_THRESHOLD,
    lostMessage: 'Grid lost'
  },

  blindPenalty: BLIND_PENALTY,

  spawn: {
    initialDelay: 2.5,
    base: 7,
    rampDivisor: 22,
    floor: 2,
    jitterMin: 0.8,
    jitterRange: 0.4,
    doubleAfter: 70,
    doubleChance: 0.4,
    origin: 'INT',
    shrugOff: { field: 'hardening', levels: HARDEN_CAP, chance: 0.4, label: 'hardened' }
  },

  dwell: {
    mitigations: [{ field: 'hardening', penalty: HARDEN_DWELL_PENALTY }],
    blockerField: 'firewall',
    containField: 'segmented',
    spreadAfterProgress: 25,
    spreadChancePerSecond: 0.25
  },

  traffic: { speed: 1.6 }
};

/** The complete scenario pack. */
export const GRID_PACK = {
  id: HARBOR_REGION.id,
  name: HARBOR_REGION.name,
  theme: 'grid',
  topology: HARBOR_REGION,
  threats: THREATS,
  threatUnlocks: THREAT_UNLOCKS,
  actions: ACTIONS,
  flow: powerFlow,
  senses: isBlind,
  config: GRID_CONFIG
};

/** Registered scenarios, keyed by id — the shape a scenario picker will consume. */
export const SCENARIOS = { [GRID_PACK.id]: GRID_PACK };

export const DEFAULT_SCENARIO = GRID_PACK;

export {
  HARBOR_REGION,
  THREATS,
  THREAT_UNLOCKS,
  ACTIONS,
  ACTION_ORDER,
  HARDEN_CAP,
  FIREWALL_SECONDS,
  ISOLATION_SECONDS,
  HUNT_BONUS,
  powerFlow,
  isBlind
};
