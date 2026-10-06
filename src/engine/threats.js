/**
 * The threat model: seeding, dwell escalation and lateral movement.
 *
 * Everything numeric here comes from config, so the same machinery drives an
 * ICS intrusion on a power mesh and (later) ransomware spreading across a file
 * share graph. What differs between scenarios is data:
 *
 *   pack.threats        the catalogue (id -> { name, rate, spreads, targets, brief })
 *   pack.threatUnlocks  when each threat type becomes available
 *   config.dwell        how mitigations scale rate, what blocks it, spread params
 *   config.spawn        how often attacks are seeded and whether they shrug off
 */

import { pick } from './rng.js';
import { event } from './events.js';
import { isAttackable, emitTraffic } from './graph.js';

/**
 * Seed one new threat somewhere valid for its type.
 *
 * Random-call order matters for determinism and is deliberately preserved from
 * the original prototype: pick type, pick target, then (conditionally) the
 * shrug-off roll.
 *
 * @param {any} run
 * @returns {import('./events.js').SimEvent[]}
 */
export function spawnThreat(run) {
  const events = [];
  const unlocks = run.pack.threatUnlocks;
  const available = unlocks.filter((u) => run.t >= u.at).map((u) => u.id);
  const id = /** @type {string} */ (pick(available, run.rng) || unlocks[0]?.id);
  const spec = run.pack.threats[id];
  if (!spec) return events;

  let candidates = Object.values(run.nodes).filter(
    (n) => isAttackable(n, run.config) && n.online && !n.threat
  );
  if (spec.targets !== '*') candidates = candidates.filter((n) => spec.targets.includes(n.type));
  if (!candidates.length) return events;

  const target = /** @type {any} */ (pick(candidates, run.rng));

  // Mitigation is a probabilistic defence, not an absolute one — that is
  // realistic, and it stops hardening from making the game trivial.
  const shrug = run.config.spawn?.shrugOff;
  if (shrug && target[shrug.field] >= shrug.levels && run.rng() < shrug.chance) {
    events.push(event('ok', target.id, `${target.name} shrugged off ${spec.name} (${shrug.label})`, 'ui'));
    return events;
  }

  target.threat = { id, progress: 0 };
  emitTraffic(run, run.config.spawn?.origin ?? target.id, target.id);
  events.push(event('bad', target.id, `${spec.name} hitting ${target.name}`, 'alert'));
  if (!run.seen[id]) {
    run.seen[id] = 1;
    events.push(event('learn', target.id, spec.brief, null));
  }
  return events;
}

/**
 * Advance the dwell on one node, spread if it is due, and complete it if the
 * node falls.
 *
 * @param {any} run
 * @param {any} node
 * @param {number} dt
 * @param {boolean} blind
 * @returns {import('./events.js').SimEvent[]}
 */
export function advanceThreat(run, node, dt, blind) {
  const events = [];
  if (!node.threat || !node.online) return events;

  const spec = run.pack.threats[node.threat.id];
  if (!spec) return events;
  const dwell = run.config.dwell;

  // Mitigation scales the rate linearly: 1 - sum(level * penalty). Kept linear
  // (rather than multiplicative) so the numbers are unchanged from the prototype.
  let multiplier = 1;
  for (const m of dwell.mitigations || []) {
    multiplier -= (node[m.field] || 0) * m.penalty;
  }
  let rate = spec.rate * multiplier * (blind ? run.config.blindPenalty : 1);
  if (dwell.blockerField && node[dwell.blockerField] > 0) rate = 0;
  node.threat.progress += rate * dt;

  if (
    spec.spreads &&
    node.threat.progress > dwell.spreadAfterProgress &&
    run.rng() < dt * dwell.spreadChancePerSecond
  ) {
    events.push(...spreadThreat(run, node));
  }

  if (node.threat.progress >= 100) {
    node.online = false;
    node.threat = null;
    run.blackouts += 1;
    events.push(event('bad', node.id, `${node.name} knocked offline`, 'breach'));
  }

  return events;
}

/**
 * Lateral movement to one eligible neighbour.
 * @param {any} run
 * @param {any} from
 * @returns {import('./events.js').SimEvent[]}
 */
export function spreadThreat(run, from) {
  const events = [];
  if (!from.threat) return events;
  const spec = run.pack.threats[from.threat.id];
  if (!spec || !spec.spreads) return events;

  const dwell = run.config.dwell;
  const blocked = (n) =>
    (dwell.blockerField && n[dwell.blockerField] > 0) || (dwell.containField && n[dwell.containField]);

  if (blocked(from)) return events;

  const neighbours = run.adj[from.id].filter((nid) => {
    const m = run.nodes[nid];
    return isAttackable(m, run.config) && m.online && !m.threat && !blocked(m);
  });
  if (!neighbours.length) return events;

  const targetId = /** @type {string} */ (pick(neighbours, run.rng));
  const target = run.nodes[targetId];
  if (!target) return events;

  target.threat = { id: from.threat.id, progress: 0 };
  emitTraffic(run, from.id, targetId);
  events.push(event('bad', target.id, `${spec.name} spread to ${target.name}`));
  return events;
}
