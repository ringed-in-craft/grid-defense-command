/**
 * Action resolution machinery.
 *
 * The engine owns the *mechanics*: the guard-then-charge-then-apply order, the
 * "return a reason instead of throwing" contract the UI depends on, and the
 * invariant that `canResolve` (a pure predicate evaluated every frame) can never
 * disagree with `resolveAction` (which mutates). A drift between those two is a
 * UI bug by construction, so it is asserted in the test suite.
 *
 * The engine does NOT own the concrete action set. The four-to-six defensive
 * actions a player can take are largely domain-flavoured — their guards read
 * scenario state and their log lines carry scenario vocabulary — so they live
 * with the scenario until a second consumer shows us which parts are genuinely
 * shared. That is a deliberate YAGNI call, not an oversight.
 */

import { event } from './events.js';
import { isDefendable } from './graph.js';
import { canAfford, spend } from './resources.js';

/**
 * Order action ids for display, by their declared `order` field.
 * @param {Record<string, {order:number}>} actions
 * @returns {string[]}
 */
export function orderActions(actions) {
  return Object.keys(actions).sort((a, b) => actions[a].order - actions[b].order);
}

/**
 * Apply a defender action to a node.
 *
 * Check order is significant and mirrors the prototype:
 *   not-running -> unknown node -> undefendable -> unknown action -> affordability -> guard
 *
 * @param {any} run
 * @param {string|null} nodeId
 * @param {string} actionId
 * @returns {{ok:boolean, reason?:string, events:import('./events.js').SimEvent[]}}
 */
export function resolveAction(run, nodeId, actionId) {
  const fail = (reason) => ({ ok: false, reason, events: [] });

  if (run.status !== 'running') return fail('not-running');
  const node = nodeId ? run.nodes[nodeId] : null;
  if (!node) return fail('no-target');
  if (!isDefendable(node, run.config)) return fail('cannot-defend');

  const spec = run.pack.actions[actionId];
  if (!spec) return fail('unknown-action');
  if (!canAfford(run, spec.cost)) return fail('budget');
  if (!spec.guard(run, node)) return fail('not-applicable');

  spend(run, spec.cost);

  /** @type {import('./events.js').SimEvent[]} */
  const events = [];
  const api = {
    /**
     * @param {'bad'|'ok'|'learn'} type
     * @param {string} message
     * @param {string|null} [cue] optional presentation hint, see events.js
     */
    emit: (type, message, cue = null) => events.push(event(type, node.id, message, cue))
  };
  spec.apply(run, node, api);

  run.events = events;
  return { ok: true, events };
}

/**
 * Whether an action would currently be accepted — drives button disabled state.
 *
 * Read-only: it must never mutate, because the UI evaluates it every frame.
 * Kept structurally identical to `resolveAction`'s checks; the agreement is
 * asserted exhaustively in the action tests.
 *
 * @param {any} run
 * @param {string|null} nodeId
 * @param {string} actionId
 * @returns {boolean}
 */
export function canResolve(run, nodeId, actionId) {
  if (run.status !== 'running') return false;
  const node = nodeId ? run.nodes[nodeId] : null;
  if (!node || !isDefendable(node, run.config)) return false;

  const spec = run.pack.actions[actionId];
  if (!spec) return false;
  if (!canAfford(run, spec.cost)) return false;

  return !!spec.guard(run, node);
}
