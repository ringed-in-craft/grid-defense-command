/**
 * Defender actions: costs, caps, effects, and — importantly — that the
 * read-only `canApply` predicate the UI uses agrees with what `applyAction`
 * will actually accept. A drift between those two is a UI bug by construction.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  createState,
  applyAction,
  canApply,
  ACTIONS,
  ACTION_ORDER,
  HARDEN_CAP,
  FIREWALL_SECONDS,
  ISOLATION_SECONDS,
  step
} from '../src/sim.js';

test('harden costs 20 and caps at 3 levels', () => {
  const s = createState();
  const before = s.budget;
  assert.equal(applyAction(s, 'S4', 'harden').ok, true);
  assert.equal(s.budget, before - ACTIONS.harden.cost);
  applyAction(s, 'S4', 'harden');
  applyAction(s, 'S4', 'harden');
  assert.equal(s.nodes.S4.hardening, HARDEN_CAP);
  assert.equal(applyAction(s, 'S4', 'harden').reason, 'not-applicable');
});

test('rate-limit costs 15 and lasts 12 seconds', () => {
  const s = createState();
  const before = s.budget;
  applyAction(s, 'S4', 'ratelimit');
  assert.equal(s.budget, before - ACTIONS.ratelimit.cost);
  assert.equal(s.nodes.S4.firewall, FIREWALL_SECONDS);
  step(s, 5);
  assert.ok(Math.abs(s.nodes.S4.firewall - (FIREWALL_SECONDS - 5)) < 1e-9);
});

test('hunt costs 20, clears the threat, and awards 50 score', () => {
  const s = createState();
  s.nodes.S4.threat = { id: 'phish', progress: 10 };
  const beforeBudget = s.budget;
  const beforeScore = s.score;
  applyAction(s, 'S4', 'hunt');
  assert.equal(s.budget, beforeBudget - ACTIONS.hunt.cost);
  assert.equal(s.nodes.S4.threat, null);
  assert.equal(s.score, beforeScore + 50);
  assert.equal(s.kills, 1);
});

test('segment costs 10 and blocks lateral movement without darkening the node', () => {
  const s = createState();
  const before = s.budget;
  applyAction(s, 'S2', 'segment');
  assert.equal(s.budget, before - ACTIONS.segment.cost);
  assert.equal(s.nodes.S2.segmented, true);
  assert.equal(s.nodes.S2.online, true, 'segmenting must not cut power');
  assert.equal(applyAction(s, 'S2', 'segment').reason, 'not-applicable');
});

test('isolate is free, purges the threat, and darkens the node for 10s', () => {
  const s = createState();
  s.nodes.S4.threat = { id: 'phish', progress: 10 };
  const before = s.budget;
  applyAction(s, 'S4', 'isolate');
  assert.equal(s.budget, before, 'isolate must be free');
  assert.equal(s.nodes.S4.online, false);
  assert.equal(s.nodes.S4.threat, null);
  assert.equal(s.nodes.S4.isolation, ISOLATION_SECONDS);

  step(s, ISOLATION_SECONDS + 0.01);
  assert.equal(s.nodes.S4.online, true, 'node must come back on its own');
});

test('restore costs 30 and brings a dark node back', () => {
  const s = createState();
  s.nodes.S4.online = false;
  const before = s.budget;
  applyAction(s, 'S4', 'restore');
  assert.equal(s.budget, before - ACTIONS.restore.cost);
  assert.equal(s.nodes.S4.online, true);
});

test('the external network cannot be defended', () => {
  const s = createState();
  for (const action of ACTION_ORDER) {
    assert.equal(applyAction(s, 'INT', action).ok, false, `INT should reject ${action}`);
  }
});

test('actions are refused when the budget is exhausted', () => {
  const s = createState();
  s.budget = 0;
  for (const action of ACTION_ORDER) {
    const res = applyAction(s, 'S4', action);
    if (ACTIONS[action].cost === 0) {
      assert.equal(res.ok, action === 'isolate', `${action} is free`);
    } else {
      assert.equal(res.ok, false, `${action} must fail with no budget`);
      assert.equal(res.reason, 'budget');
    }
  }
});

test('nothing can be done once the grid is lost', () => {
  const s = createState();
  s.status = 'lost';
  for (const action of ACTION_ORDER) {
    assert.equal(applyAction(s, 'S4', action).ok, false);
  }
});

test('canApply agrees with applyAction across every node/action pair', () => {
  const scenarios = [
    (s) => {},
    (s) => {
      s.nodes.S4.threat = { id: 'phish', progress: 5 };
    },
    (s) => {
      s.nodes.S4.online = false;
    },
    (s) => {
      s.budget = 0;
    },
    (s) => {
      s.nodes.S4.hardening = HARDEN_CAP;
      s.nodes.S4.segmented = true;
      s.nodes.S2.online = false;
    }
  ];

  for (const mutate of scenarios) {
    for (const nodeId of Object.keys(createState().nodes)) {
      for (const action of ACTION_ORDER) {
        const probe = createState();
        mutate(probe);
        const predicted = canApply(probe, nodeId, action);

        const actual = createState();
        mutate(actual);
        const real = applyAction(actual, nodeId, action).ok;

        assert.equal(
          predicted,
          real,
          `canApply drift: node=${nodeId} action=${action} predicted=${predicted} actual=${real}`
        );
      }
    }
  }
});
