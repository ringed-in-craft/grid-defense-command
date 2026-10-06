/**
 * Power-flow invariants.
 *
 * These are the tests that matter most: if the electrical model is wrong the
 * game teaches the wrong lesson. Several of them encode surprising, deliberate
 * properties (mesh redundancy, and the fact that the control centre draws power
 * without carrying it).
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createState, powerFlow, isBlind } from '../src/sim.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('all nodes online serves 100% of load', () => {
  const s = createState();
  assert.equal(powerFlow(s), 1);
});

test('total load weight is 7 (hospital 3 + two cities of 2)', () => {
  const s = createState();
  const total = Object.values(s.nodes)
    .filter((n) => n.type === 'load')
    .reduce((a, n) => a + n.weight, 0);
  assert.equal(total, 7);
});

test('n-1: losing Substation 2 alone still serves 100% (mesh redundancy)', () => {
  const s = createState();
  s.nodes.S2.online = false;
  assert.equal(powerFlow(s), 1);
});

test('losing the hydro dam AND Substation 2 serves exactly 2/7', () => {
  const s = createState();
  s.nodes.P1.online = false;
  s.nodes.S2.online = false;
  // Only the gas plant remains, feeding Sub 3 -> Harbor city.
  assert.ok(close(powerFlow(s), 2 / 7), `expected 2/7, got ${powerFlow(s)}`);
});

test('with no generation online, nothing is served', () => {
  const s = createState();
  s.nodes.P1.online = false;
  s.nodes.P2.online = false;
  assert.equal(powerFlow(s), 0);
});

test('isolating a bridge substation darkens everything downstream of it', () => {
  const s = createState();
  s.nodes.P1.online = false; // force all supply through the gas plant
  s.nodes.S2.online = false;
  s.nodes.S3.online = false; // S3 was the only live feed to Harbor city
  assert.equal(powerFlow(s), 0);
});

test('the external network is never energised', () => {
  const s = createState();
  powerFlow(s);
  assert.equal(s.nodes.INT.powered, false);
});

test('the control centre is powered when it has a live feed', () => {
  const s = createState();
  powerFlow(s);
  assert.equal(s.nodes.SOC.powered, true);
  assert.equal(isBlind(s), false);
});

test('the control centre does NOT relay power (not a conduit)', () => {
  const s = createState();
  // Cut SOC's feed from the gas plant and from Substation 1/2. SOC has four
  // links: INT (never energised), S1, S2, P2. With S1 and S2 dark, P2 is the
  // only remaining feed.
  s.nodes.S1.online = false;
  s.nodes.S2.online = false;
  powerFlow(s);
  assert.equal(s.nodes.SOC.powered, true, 'still fed by P2');

  s.nodes.P2.online = false;
  powerFlow(s);
  assert.equal(s.nodes.SOC.powered, false, 'no feed left');
  assert.equal(isBlind(s), true, 'unpowered control centre means blind');
});

test('a downed control centre blinds the operator', () => {
  const s = createState();
  s.nodes.SOC.online = false;
  powerFlow(s);
  assert.equal(isBlind(s), true);
});

test('service ratio stays within [0,1] under arbitrary disruption', () => {
  const s = createState();
  const ids = Object.keys(s.nodes);
  for (const id of ids) {
    s.nodes[id].online = false;
    const r = powerFlow(s);
    assert.ok(r >= 0 && r <= 1, `ratio out of range: ${r}`);
    s.nodes[id].online = true;
  }
});
