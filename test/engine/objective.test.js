import test from 'node:test';
import assert from 'node:assert/strict';
import { accrueScore, isLost, awardBonus } from '../../src/engine/objective.js';

const run = (over = {}) => ({
  score: 0,
  service: 1,
  config: { objective: { scoreRate: 2, lossBelow: 0.2, lostMessage: 'Lost' } },
  ...over
});

test('score accrues proportionally to service', () => {
  const a = run({ service: 1 });
  accrueScore(a, 1);
  assert.equal(a.score, 2);

  const b = run({ service: 0.25 });
  accrueScore(b, 1);
  assert.equal(b.score, 0.5);
});

test('zero service earns nothing', () => {
  const r = run({ service: 0 });
  accrueScore(r, 10);
  assert.equal(r.score, 0);
});

test('isLost uses the configured threshold, exclusive', () => {
  assert.equal(isLost(run({ service: 0.5 })), false);
  assert.equal(isLost(run({ service: 0.2 })), false, 'exactly at threshold is not a loss');
  assert.equal(isLost(run({ service: 0.199 })), true);
});

test('awardBonus adds a flat amount', () => {
  const r = run({ score: 10 });
  awardBonus(r, 50);
  assert.equal(r.score, 60);
});
