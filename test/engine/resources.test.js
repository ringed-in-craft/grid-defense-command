import { test } from 'vitest';
import assert from 'node:assert/strict';
import { regenBudget, canAfford, spend } from '../../src/engine/resources.js';

const run = (over) => ({
  budget: 0,
  config: { resources: { budget: { start: 0, perSecond: 2, cap: 10 } } },
  ...over
});

test('regenBudget accrues at the configured rate', () => {
  const r = run();
  regenBudget(r, 3);
  assert.ok(Math.abs(r.budget - 6) < 1e-9);
});

test('regenBudget respects the cap', () => {
  const r = run();
  regenBudget(r, 100);
  assert.equal(r.budget, 10);
});

test('regenBudget never exceeds the cap across many ticks', () => {
  const r = run();
  for (let i = 0; i < 500; i++) {
    regenBudget(r, 0.1);
    assert.ok(r.budget <= 10 + 1e-9);
  }
});

test('canAfford handles exact affordability', () => {
  const r = run({ budget: 5 });
  assert.equal(canAfford(r, 5), true);
  assert.equal(canAfford(r, 5.0001), false);
  assert.equal(canAfford(r, 0), true);
});

test('spend deducts', () => {
  const r = run({ budget: 12 });
  spend(r, 4);
  assert.equal(r.budget, 8);
});
