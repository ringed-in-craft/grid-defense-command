/**
 * Threat machinery, driven entirely by the orchard fixture.
 *
 * Nothing here mentions grids, substations or phishing. That is the point: if
 * this passes, the threat engine is genuinely domain-independent.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../../src/engine/run.js';
import { spawnThreat, advanceThreat, spreadThreat } from '../../src/engine/threats.js';
import { ORCHARD_PACK, packWith } from './fixture.js';

/** A pack with lateral movement effectively disabled, for pure-dwell tests. */
const noSpread = () =>
  packWith({
    config: {
      ...ORCHARD_PACK.config,
      dwell: { ...ORCHARD_PACK.config.dwell, spreadAfterProgress: 1e9 }
    }
  });

const place = (run, nodeId, threatId, progress = 0) => {
  run.nodes[nodeId].threat = { id: threatId, progress };
};

test('spawnThreat seeds an attackable, online, threat-free node', () => {
  const run = createRun(ORCHARD_PACK, 1);
  const events = spawnThreat(run);
  const seeded = Object.values(run.nodes).filter((n) => n.threat);
  assert.equal(seeded.length, 1);
  assert.ok(events.some((e) => e.type === 'bad'));
});

test('spawnThreat never seeds the unattackable node', () => {
  const run = createRun(ORCHARD_PACK, 2);
  // Saturate every attackable node so only the sun remains as a candidate.
  for (const id in run.nodes) {
    if (run.nodes[id].type !== 'sun') run.nodes[id].threat = { id: 'blight', progress: 0 };
  }
  const events = spawnThreat(run);
  assert.equal(run.nodes.SUN.threat, null);
  assert.deepEqual(events, [], 'no candidate should mean no spawn');
});

test('spawnThreat respects a threat restricted to certain node types', () => {
  const pack = packWith({ threatUnlocks: [{ id: 'pest', at: 0 }] });
  for (let seed = 1; seed <= 40; seed++) {
    const run = createRun(pack, seed);
    spawnThreat(run);
    const seeded = Object.values(run.nodes).filter((n) => n.threat);
    for (const n of seeded) assert.equal(n.type, 'relay', `pest seeded on ${n.type}`);
  }
});

test('spawnThreat emits the briefing exactly once per threat type', () => {
  const run = createRun(ORCHARD_PACK, 5);
  const first = spawnThreat(run);
  assert.ok(first.some((e) => e.type === 'learn'), 'first sighting teaches');
  // clear and re-seed the same type
  for (const id in run.nodes) run.nodes[id].threat = null;
  const second = spawnThreat(run);
  assert.ok(!second.some((e) => e.type === 'learn'), 'briefing is not repeated');
});

test('a fully-mitigated node shrugs off seeding', () => {
  const run = createRun(ORCHARD_PACK, 7);
  // config: shrugOff at trims >= 2 with chance 1.
  for (const id in run.nodes) {
    run.nodes[id].trims = 2;
    run.nodes[id].threat = null;
  }
  const events = spawnThreat(run);
  const seeded = Object.values(run.nodes).filter((n) => n.threat);
  assert.equal(seeded.length, 0);
  assert.ok(events.some((e) => /shrugged off/.test(e.message)));
});

test('dwell accrues at the catalogue rate with no mitigation', () => {
  const run = createRun(noSpread(), 1);
  place(run, 'T1', 'blight');
  advanceThreat(run, run.nodes.T1, 1, false);
  assert.ok(Math.abs(run.nodes.T1.threat.progress - 10) < 1e-9, 'blight runs at 10/s');
});

test('mitigation scales dwell linearly and can neutralise it entirely', () => {
  const run = createRun(noSpread(), 1);
  place(run, 'T1', 'blight');
  run.nodes.T1.trims = 1; // penalty 0.5 per level
  advanceThreat(run, run.nodes.T1, 1, false);
  assert.ok(Math.abs(run.nodes.T1.threat.progress - 5) < 1e-9, 'half rate at one level');

  const run2 = createRun(noSpread(), 1);
  place(run2, 'T1', 'blight');
  run2.nodes.T1.trims = 2; // 1 - 0.5*2 = 0
  advanceThreat(run2, run2.nodes.T1, 1, false);
  assert.equal(run2.nodes.T1.threat.progress, 0, 'fully mitigated means zero dwell');
});

test('blindness multiplies dwell by the configured penalty', () => {
  const sighted = createRun(noSpread(), 1);
  place(sighted, 'T1', 'blight');
  advanceThreat(sighted, sighted.nodes.T1, 1, false);

  const blind = createRun(noSpread(), 1);
  place(blind, 'T1', 'blight');
  advanceThreat(blind, blind.nodes.T1, 1, true);

  // fixture blindPenalty is 2
  assert.equal(blind.nodes.T1.threat.progress, sighted.nodes.T1.threat.progress * 2);
});

test('the blocker field freezes dwell completely', () => {
  const run = createRun(noSpread(), 1);
  place(run, 'T1', 'blight');
  run.nodes.T1.sprayed = 5;
  advanceThreat(run, run.nodes.T1, 1, false);
  assert.equal(run.nodes.T1.threat.progress, 0);
});

test('a threat that completes takes the node offline', () => {
  const run = createRun(noSpread(), 1);
  place(run, 'P', 'pest', 99); // pest does not spread
  const events = advanceThreat(run, run.nodes.P, 1, false);
  assert.equal(run.nodes.P.online, false);
  assert.equal(run.nodes.P.threat, null);
  assert.equal(run.blackouts, 1);
  assert.ok(events.some((e) => /knocked offline/.test(e.message)));
});

test('lateral movement is blocked by the contain field', () => {
  const run = createRun(ORCHARD_PACK, 3);
  place(run, 'P', 'blight', 50);
  run.nodes.P.fenced = true;
  for (let i = 0; i < 300; i++) spreadThreat(run, run.nodes.P);
  const others = Object.values(run.nodes).filter((n) => n.threat && n.id !== 'P');
  assert.equal(others.length, 0, 'a fenced source cannot spread');
});

test('lateral movement is blocked by the blocker field', () => {
  const run = createRun(ORCHARD_PACK, 3);
  place(run, 'P', 'blight', 50);
  run.nodes.P.sprayed = 1e9;
  for (let i = 0; i < 300; i++) spreadThreat(run, run.nodes.P);
  const others = Object.values(run.nodes).filter((n) => n.threat && n.id !== 'P');
  assert.equal(others.length, 0);
});

test('non-spreading threats never move laterally', () => {
  const run = createRun(ORCHARD_PACK, 3);
  place(run, 'P', 'pest', 50); // pest does not spread
  for (let i = 0; i < 300; i++) spreadThreat(run, run.nodes.P);
  const others = Object.values(run.nodes).filter((n) => n.threat && n.id !== 'P');
  assert.equal(others.length, 0);
});

test('a spreading threat reaches only adjacent nodes', () => {
  const run = createRun(ORCHARD_PACK, 11);
  place(run, 'P', 'blight', 50);
  let infected = new Set(['P']);
  for (let i = 0; i < 2000; i++) {
    const events = advanceThreat(run, run.nodes.P, 0.1, false);
    for (const e of events) {
      if (/spread to/.test(e.message)) {
        assert.ok(
          run.adj[e.nodeId].some((nid) => infected.has(nid)),
          `${e.nodeId} infected with no infected neighbour`
        );
      }
    }
    for (const id in run.nodes) if (run.nodes[id].threat) infected.add(id);
  }
  assert.ok(infected.size > 1, 'expected the blight to actually spread');
});
