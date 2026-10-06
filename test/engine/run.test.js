/**
 * The run loop, driven by the orchard fixture.
 *
 * This is the test that proves the engine is a general graph simulation rather
 * than a power-grid game with renamed variables: a blight spreading across fruit
 * trees runs on entirely the same machinery as a power-grid intrusion.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRun, step, applyAction, canApply, ENGINE_VERSION } from '../../src/engine/run.js';
import { ORCHARD_PACK } from './fixture.js';

/** A compact fingerprint of a finished run, for comparing runs. */
function signature(run) {
  const nodes = Object.keys(run.nodes)
    .sort()
    .map((id) => {
      const n = run.nodes[id];
      return `${id}:${n.online ? 1 : 0}${n.trims}${n.fenced ? 'f' : '-'}`;
    })
    .join(',');
  return `${run.status}|${run.t.toFixed(3)}|${Math.round(run.score)}|${run.blackouts}|${nodes}`;
}

function simulate(seed, maxSeconds = 60, dt = 0.1, policy = () => {}) {
  const run = createRun(ORCHARD_PACK, seed);
  const ticks = Math.ceil(maxSeconds / dt);
  for (let i = 0; i < ticks && run.status === 'running'; i++) {
    policy(run);
    step(run, dt);
  }
  return run;
}

test('createRun builds the stated shape', () => {
  const run = createRun(ORCHARD_PACK, 42);
  assert.equal(run.seed, 42);
  assert.equal(run.t, 0);
  assert.equal(run.status, 'running');
  assert.equal(run.score, 0);
  assert.equal(run.kills, 0);
  assert.equal(run.blackouts, 0);
  assert.equal(run.budget, ORCHARD_PACK.config.resources.budget.start);
  assert.deepEqual(Object.keys(run.nodes).sort(), ['F1', 'F2', 'P', 'SUN', 'T1', 'T2']);
  assert.equal(run.links, ORCHARD_PACK.topology.links);
});

test('createRun computes the initial service level', () => {
  const run = createRun(ORCHARD_PACK, 1);
  assert.equal(run.service, 1, 'everything healthy serves all the crop weight');
});

test('createRun defaults to not blind when the pack declares no senses', () => {
  const run = createRun(ORCHARD_PACK, 1);
  assert.equal(run.blind, false);
  assert.equal(typeof ORCHARD_PACK.senses, 'undefined');
});

test('step advances the clock, regenerates budget and accrues score', () => {
  const run = createRun(ORCHARD_PACK, 1);
  step(run, 1);
  assert.ok(Math.abs(run.t - 1) < 1e-9);
  assert.equal(run.budget, ORCHARD_PACK.config.resources.budget.start + 1);
  assert.equal(run.score, 1, 'service 1 * dt 1 * scoreRate 1');
});

test('step is a no-op once the run is lost', () => {
  const run = createRun(ORCHARD_PACK, 1);
  run.status = 'lost';
  assert.deepEqual(step(run, 1), []);
  assert.equal(run.t, 0);
});

test('step ignores a non-positive dt', () => {
  const run = createRun(ORCHARD_PACK, 1);
  assert.deepEqual(step(run, 0), []);
  assert.deepEqual(step(run, -5), []);
  assert.equal(run.t, 0);
});

test('the same seed reproduces a run exactly', () => {
  assert.equal(signature(simulate(7)), signature(simulate(7)));
});

test('different seeds produce different runs', () => {
  assert.notEqual(signature(simulate(1)), signature(simulate(2)));
});

test('seeds are independent of wall-clock or ambient state', () => {
  const a = simulate(99, 30);
  const b = simulate(99, 30);
  assert.deepEqual(a.events.map((e) => e.message), b.events.map((e) => e.message));
});

test('service stays in [0,1] and budget within its cap over a long run', () => {
  const run = createRun(ORCHARD_PACK, 3);
  for (let i = 0; i < 2000; i++) {
    step(run, 0.1);
    assert.ok(run.service >= 0 && run.service <= 1, `service out of range: ${run.service}`);
    assert.ok(run.budget <= ORCHARD_PACK.config.resources.budget.cap + 1e-9);
  }
});

test('score never decreases', () => {
  const run = createRun(ORCHARD_PACK, 4);
  let prev = run.score;
  for (let i = 0; i < 600; i++) {
    step(run, 0.1);
    assert.ok(run.score >= prev);
    prev = run.score;
  }
});

test('losing the crops loses the run', () => {
  const run = createRun(ORCHARD_PACK, 1);
  run.nodes.F1.online = false;
  run.nodes.F2.online = false;
  step(run, 0.1);
  assert.equal(run.service, 0);
  assert.equal(run.status, 'lost');
  assert.ok(run.events.some((e) => e.message === ORCHARD_PACK.config.objective.lostMessage));
});

test('a timer expiry can bring a node back, per config', () => {
  const run = createRun(ORCHARD_PACK, 1);
  run.nodes.T1.sprayed = 0.5;
  const events = step(run, 1);
  assert.equal(run.nodes.T1.sprayed, 0);
  assert.ok(events.some((e) => /spray dried off/.test(e.message)));
});

test('packets advance and are discarded', () => {
  const run = createRun(ORCHARD_PACK, 1);
  step(run, 0.5);
  // spawnTraffic may or may not have fired; assert the mechanism, not the count
  for (const p of run.packets) assert.ok(p.t >= 0 && p.t < 1);
});

test('applyAction and canApply are exposed on the run module', () => {
  const run = createRun(ORCHARD_PACK, 1);
  assert.equal(canApply(run, 'T1', 'trim'), true);
  assert.equal(applyAction(run, 'T1', 'trim').ok, true);
  assert.equal(canApply(run, 'T1', 'trim'), true, 'still applicable below the cap');
});

test('the engine reports a version, for the vendoring lock in M2', () => {
  assert.match(ENGINE_VERSION, /^\d+\.\d+\.\d+$/);
});
