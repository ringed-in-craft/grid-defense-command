import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildGraph, isAttackable, isDefendable, emitTraffic, advanceTraffic } from '../../src/engine/graph.js';

const ASSETS = [
  { id: 'A', name: 'Alpha', type: 'producer', x: 0.1, y: 0.1 },
  { id: 'B', name: 'Beta', type: 'relay', x: 0.5, y: 0.5 },
  { id: 'C', name: 'Sun', type: 'sun', x: 0.9, y: 0.9, weight: 4 }
];
const LINKS = [['A', 'B'], ['B', 'C']];

const STATE_CONFIG = {
  counters: ['trims'],
  timers: ['sprayed'],
  flags: ['fenced'],
  undefendableTypes: ['sun'],
  unattackableTypes: ['sun']
};

test('buildGraph copies asset fields and initialises declared state', () => {
  const { nodes } = buildGraph(ASSETS, LINKS, STATE_CONFIG);
  assert.equal(nodes.A.name, 'Alpha');
  assert.equal(nodes.A.type, 'producer');
  assert.equal(nodes.A.x, 0.1);
  assert.equal(nodes.C.weight, 4);
  assert.equal(nodes.A.online, true);
  assert.equal(nodes.A.threat, null);
  // declared state fields
  assert.equal(nodes.A.trims, 0);
  assert.equal(nodes.A.sprayed, 0);
  assert.equal(nodes.A.fenced, false);
});

test('buildGraph defaults weight to 0 when absent', () => {
  const { nodes } = buildGraph(ASSETS, LINKS, STATE_CONFIG);
  assert.equal(nodes.A.weight, 0);
});

test('buildGraph creates symmetric adjacency', () => {
  const { adj } = buildGraph(ASSETS, LINKS, STATE_CONFIG);
  assert.deepEqual(adj.A, ['B']);
  assert.deepEqual(adj.B.sort(), ['A', 'C']);
  assert.deepEqual(adj.C, ['B']);
});

test('buildGraph preserves asset insertion order for stable iteration', () => {
  const { nodes } = buildGraph(ASSETS, LINKS, STATE_CONFIG);
  assert.deepEqual(Object.keys(nodes), ['A', 'B', 'C']);
});

test('state fields are optional', () => {
  const { nodes } = buildGraph(ASSETS, LINKS);
  assert.equal(nodes.A.online, true);
  assert.equal(nodes.A.trims, undefined);
});

test('isAttackable and isDefendable honour the config blocklists', () => {
  const config = { state: STATE_CONFIG };
  const { nodes } = buildGraph(ASSETS, LINKS, STATE_CONFIG);
  assert.equal(isAttackable(nodes.A, config), true);
  assert.equal(isDefendable(nodes.A, config), true);
  assert.equal(isAttackable(nodes.C, config), false);
  assert.equal(isDefendable(nodes.C, config), false);
});

test('isAttackable and isDefendable default to true with no config', () => {
  const { nodes } = buildGraph(ASSETS, LINKS);
  assert.equal(isAttackable(nodes.C, {}), true);
  assert.equal(isDefendable(nodes.C, {}), true);
});

test('traffic marks advance and are dropped when finished', () => {
  const run = { packets: [], config: { traffic: { speed: 1 } } };
  emitTraffic(run, 'A', 'B');
  assert.equal(run.packets.length, 1);
  assert.equal(run.packets[0].from, 'A');
  advanceTraffic(run, 0.5);
  assert.ok(Math.abs(run.packets[0].t - 0.5) < 1e-9);
  assert.equal(run.packets.length, 1, 'still in flight');
  advanceTraffic(run, 0.5);
  assert.equal(run.packets.length, 0, 'finished marks are dropped');
});

test('traffic speed defaults when unconfigured', () => {
  const run = { packets: [], config: {} };
  emitTraffic(run, 'A', 'B');
  advanceTraffic(run, 1);
  assert.equal(run.packets.length, 0);
});
