/**
 * End-to-end engine behaviour: determinism, and the difficulty guarantees we
 * actually want to hold. The balance assertions are made on means over many
 * seeds because the simulation is stochastic by design.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, BUDGET_CAP } from '../src/sim.js';
import { simulate, competentPolicy, actOnThreats, seeds, meanOver } from './helpers.js';

/** A compact fingerprint of a finished run, for comparing runs. */
function signature(state) {
  const nodes = Object.keys(state.nodes)
    .sort()
    .map((id) => {
      const n = state.nodes[id];
      return `${id}:${n.online ? 1 : 0}${n.hardening}${n.segmented ? 's' : '-'}`;
    })
    .join(',');
  return `${state.status}|${state.t.toFixed(3)}|${Math.round(state.score)}|${state.kills}|${state.blackouts}|${nodes}`;
}

test('the same seed reproduces a run exactly', () => {
  const a = simulate({ seed: 42, policy: competentPolicy, maxSeconds: 180 });
  const b = simulate({ seed: 42, policy: competentPolicy, maxSeconds: 180 });
  assert.equal(signature(a), signature(b));
});

test('different seeds produce different runs', () => {
  const a = simulate({ seed: 1, policy: competentPolicy, maxSeconds: 180 });
  const b = simulate({ seed: 2, policy: competentPolicy, maxSeconds: 180 });
  assert.notEqual(signature(a), signature(b));
});

test('service ratio stays in [0,1] and budget never exceeds the cap', () => {
  const s = createState(undefined, 5);
  for (let i = 0; i < 3000; i++) {
    step(s, 0.1);
    assert.ok(s.service >= 0 && s.service <= 1, `service out of range: ${s.service}`);
    assert.ok(s.budget <= BUDGET_CAP + 1e-9, `budget exceeded cap: ${s.budget}`);
  }
});

test('score is monotonically non-decreasing', () => {
  const s = createState(undefined, 8);
  let prev = s.score;
  for (let i = 0; i < 1500; i++) {
    step(s, 0.1);
    assert.ok(s.score >= prev, 'score went backwards with no penalty mechanic');
    prev = s.score;
  }
});

test('doing nothing loses the grid, and quickly', () => {
  const mean = meanOver(seeds(12), (seed) => {
    const s = simulate({ seed, policy: () => {}, maxSeconds: 400 });
    return s.t;
  });
  assert.equal(simulate({ seed: 1, policy: () => {}, maxSeconds: 400 }).status, 'lost');
  assert.ok(mean < 90, `idle play should collapse fast, mean survival was ${mean.toFixed(1)}s`);
});

test('active defence survives materially longer than doing nothing', () => {
  const idle = meanOver(seeds(12), (seed) => simulate({ seed, maxSeconds: 400 }).t);
  const active = meanOver(seeds(12), (seed) =>
    simulate({ seed, policy: competentPolicy, maxSeconds: 400 }).t
  );
  assert.ok(active > idle * 1.5, `defence barely helped: idle ${idle.toFixed(1)}s vs active ${active.toFixed(1)}s`);
});

test('isolate-spam is not a dominant strategy', () => {
  const isolated = meanOver(seeds(12), (seed) =>
    simulate({ seed, policy: (s) => actOnThreats(s, 'isolate'), maxSeconds: 400 }).t
  );
  const competent = meanOver(seeds(12), (seed) =>
    simulate({ seed, policy: competentPolicy, maxSeconds: 400 }).t
  );
  assert.ok(
    isolated <= competent,
    `isolating everything should not beat hunting: isolate ${isolated.toFixed(1)}s vs hunt ${competent.toFixed(1)}s`
  );
});
