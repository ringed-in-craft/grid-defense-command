/**
 * Action resolution, driven by the orchard fixture.
 *
 * The most valuable assertion here is the last one: that `canResolve` (the pure
 * predicate the UI evaluates every frame) can never disagree with
 * `resolveAction` (which mutates). Drift between those two is a UI bug by
 * construction — a button that looks enabled and does nothing, or worse, looks
 * disabled and works.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../../src/engine/run.js';
import { resolveAction, canResolve, orderActions } from '../../src/engine/actions.js';
import { ORCHARD_PACK, ORCHARD_ACTIONS } from './fixture.js';

const fresh = (over = {}) => {
  const run = createRun(ORCHARD_PACK, 1);
  Object.assign(run, over);
  return run;
};

test('orderActions sorts by the declared order field', () => {
  assert.deepEqual(orderActions(ORCHARD_ACTIONS), ['trim', 'spray', 'clear', 'revive']);
});

test('a successful action charges the budget and mutates the node', () => {
  const run = fresh();
  const before = run.budget;
  const res = resolveAction(run, 'T1', 'trim');
  assert.equal(res.ok, true);
  assert.equal(run.budget, before - 5);
  assert.equal(run.nodes.T1.trims, 1);
  assert.ok(res.events.some((e) => /Trimmed Tree 1/.test(e.message)));
});

test('the event carries the acting node id', () => {
  const run = fresh();
  const res = resolveAction(run, 'T2', 'trim');
  assert.ok(res.events.every((e) => e.nodeId === 'T2'));
});

test('an undefendable node type is refused', () => {
  const run = fresh();
  const res = resolveAction(run, 'SUN', 'trim');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'cannot-defend');
});

test('an unknown node is refused', () => {
  const res = resolveAction(fresh(), 'NOPE', 'trim');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-target');
});

test('a null selection is refused', () => {
  const res = resolveAction(fresh(), null, 'trim');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-target');
});

test('an unknown action is refused', () => {
  const res = resolveAction(fresh(), 'T1', 'nonsense');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unknown-action');
});

test('an unaffordable action is refused as a budget failure, not a guard failure', () => {
  const run = fresh({ budget: 0 });
  const res = resolveAction(run, 'T1', 'trim');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'budget');
  assert.equal(run.nodes.T1.trims, 0, 'nothing should have been applied');
  assert.equal(run.budget, 0);
});

test('a free action still succeeds with no budget', () => {
  const run = fresh({ budget: 0 });
  const res = resolveAction(run, 'T1', 'clear');
  assert.equal(res.ok, true);
  assert.equal(run.nodes.T1.online, false);
});

test('a guard failure is reported as not-applicable', () => {
  const run = fresh();
  run.nodes.T1.trims = 2; // at the cap
  const res = resolveAction(run, 'T1', 'trim');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not-applicable');
});

test('nothing can be done once the run is over', () => {
  const run = fresh({ status: 'lost' });
  for (const id of Object.keys(ORCHARD_ACTIONS)) {
    const res = resolveAction(run, 'T1', id);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not-running');
  }
});

test('canResolve agrees with resolveAction across every node/action/situation', () => {
  const situations = [
    (run) => {},
    (run) => {
      run.nodes.T1.threat = { id: 'blight', progress: 5 };
    },
    (run) => {
      run.nodes.T1.online = false;
    },
    (run) => {
      run.budget = 0;
    },
    (run) => {
      run.nodes.T1.trims = 2;
      run.nodes.T1.fenced = true;
      run.status = 'lost';
    }
  ];

  for (const setup of situations) {
    for (const nodeId of Object.keys(createRun(ORCHARD_PACK, 1).nodes)) {
      for (const actionId of Object.keys(ORCHARD_ACTIONS)) {
        const probe = fresh();
        setup(probe);
        const predicted = canResolve(probe, nodeId, actionId);

        const actual = fresh();
        setup(actual);
        const real = resolveAction(actual, nodeId, actionId).ok;

        assert.equal(
          predicted,
          real,
          `canResolve drift: node=${nodeId} action=${actionId} predicted=${predicted} actual=${real}`
        );
      }
    }
  }
});
