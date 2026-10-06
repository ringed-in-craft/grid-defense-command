import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pick } from '../../src/engine/rng.js';

test('mulberry32 is reproducible from its seed', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test('different seeds diverge', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test('output stays in [0,1)', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 5000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('a zero seed still produces a usable stream', () => {
  const rng = mulberry32(0);
  const v = rng();
  assert.ok(Number.isFinite(v) && v >= 0 && v < 1);
});

test('pick selects a member and is deterministic per generator', () => {
  const items = ['a', 'b', 'c', 'd'];
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const x = pick(items, a);
    assert.ok(items.includes(x));
    assert.equal(x, pick(items, b));
  }
});

test('pick of a single-element array always returns that element', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 10; i++) assert.equal(pick(['only'], rng), 'only');
});

test('pick of an empty array returns undefined', () => {
  assert.equal(pick([], mulberry32(1)), undefined);
});
