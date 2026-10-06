/**
 * Threat behaviour: dwell, escalation, lateral movement, and the defences that
 * blunt each one. Spawning is suppressed in these tests by parking the schedule
 * far in the future, so exactly one threat is under observation.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createState, step, isBlind } from '../src/sim.js';

/** A state with the attack schedule effectively disabled. */
function quietState(seed = 7) {
  const s = createState(undefined, seed);
  s.spawnTimer = 1e9;
  return s;
}

function place(state, nodeId, threatId = 'phish', progress = 0) {
  state.nodes[nodeId].threat = { id: threatId, progress };
}

test('a threat accumulates dwell time and eventually blacks the node out', () => {
  const s = quietState();
  place(s, 'S4');
  step(s, 1);
  assert.ok(s.nodes.S4.threat.progress > 0, 'progress should advance');
  place(s, 'S4', 'phish', 99);
  step(s, 1);
  assert.equal(s.nodes.S4.online, false);
  assert.equal(s.nodes.S4.threat, null);
  assert.equal(s.blackouts, 1);
});

test('hardening slows escalation in proportion to level', () => {
  const base = quietState();
  place(base, 'S4');
  step(base, 1);

  const hardened = quietState();
  hardened.nodes.S4.hardening = 3;
  place(hardened, 'S4');
  step(hardened, 1);

  // Spearphishing runs at 6 points/sec; level 3 cuts that by 75%.
  assert.ok(Math.abs(base.nodes.S4.threat.progress - 6) < 1e-9);
  assert.ok(Math.abs(hardened.nodes.S4.threat.progress - 1.5) < 1e-9);
});

test('a rate-limit freezes escalation completely while it is up', () => {
  const s = quietState();
  s.nodes.S4.firewall = 12;
  place(s, 'S4');
  step(s, 5);
  assert.equal(s.nodes.S4.threat.progress, 0);
});

test('losing the control centre makes every threat 50% faster', () => {
  const sighted = quietState();
  place(sighted, 'S4');
  step(sighted, 1);

  const blind = quietState();
  blind.nodes.SOC.online = false;
  assert.equal(isBlind(blind), true);
  place(blind, 'S4');
  step(blind, 1);

  const ratio = blind.nodes.S4.threat.progress / sighted.nodes.S4.threat.progress;
  assert.ok(Math.abs(ratio - 1.5) < 1e-9, `expected 1.5x, got ${ratio}`);
});

test('lateral movement cannot reach a segmented neighbour', () => {
  const s = quietState();
  // Segment every neighbour of S2 without segmenting S2 itself.
  for (const nid of s.adj.S2) s.nodes[nid].segmented = true;
  place(s, 'S2', 'phish', 30);

  for (let i = 0; i < 600; i++) step(s, 0.1);

  for (const nid of s.adj.S2) {
    assert.equal(s.nodes[nid].threat, null, `${nid} should not have been infected`);
  }
});

test('a segmented source cannot spread at all', () => {
  const s = quietState();
  s.nodes.S2.segmented = true;
  place(s, 'S2', 'phish', 30);

  for (let i = 0; i < 600; i++) step(s, 0.1);
  const infected = Object.values(s.nodes).filter((n) => n.threat && n.id !== 'S2');
  assert.equal(infected.length, 0);
});

test('a rate-limited source cannot spread', () => {
  const s = quietState();
  s.nodes.S2.firewall = 1e6; // held up for the whole test
  place(s, 'S2', 'phish', 30);

  for (let i = 0; i < 600; i++) step(s, 0.1);
  const infected = Object.values(s.nodes).filter((n) => n.threat && n.id !== 'S2');
  assert.equal(infected.length, 0);
});

test('non-spreading threats never move laterally', () => {
  const s = quietState();
  place(s, 'S3', 'ics', 30); // ICS protocol attack does not spread
  for (let i = 0; i < 600; i++) step(s, 0.1);
  const infected = Object.values(s.nodes).filter((n) => n.threat && n.id !== 'S3');
  assert.equal(infected.length, 0);
});

test('denial of service only ever seeds on the control centre', () => {
  const s = createState(undefined, 3);
  for (let i = 0; i < 400; i++) {
    const events = step(s, 0.1);
    for (const e of events) {
      if (e.message.startsWith('Denial')) {
        assert.equal(s.nodes[e.nodeId].type, 'soc');
      }
    }
  }
});

test('lateral movement only ever targets a node adjacent to an infected one', () => {
  const s = createState(undefined, 11);
  /** @type {Set<string>} */
  let infected = new Set(Object.keys(s.nodes).filter((id) => s.nodes[id].threat));

  for (let i = 0; i < 4000; i++) {
    const events = step(s, 0.1);
    for (const e of events) {
      if (!e.message.includes('spread to')) continue;
      // A newly infected node must be adjacent to something already infected.
      // (Nodes only spread once their dwell passes 25, so within a single tick
      // a fresh infection cannot itself spread — the pre-tick set is correct.)
      assert.ok(
        s.adj[e.nodeId].some((nid) => infected.has(nid)),
        `${e.nodeId} was infected with no infected neighbour`
      );
    }
    infected = new Set([...infected, ...Object.keys(s.nodes).filter((id) => s.nodes[id].threat)]);
  }
  assert.ok(infected.size > 1, 'expected the threat to actually spread during this run');
});
