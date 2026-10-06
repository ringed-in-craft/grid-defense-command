/**
 * Difficulty report.
 *
 * Prints the measured difficulty curve so the numbers quoted in the README can
 * be regenerated rather than trusted. Run with: npm run balance
 *
 * Everything is a mean over many seeds because the simulation is stochastic —
 * a single run tells you very little.
 */

import { createState, step, applyAction, powerFlow, HARBOR_REGION } from '../src/sim.js';

const DT = 0.1;
const MAX_SECONDS = 400;
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function run(seed, policy) {
  const state = createState(HARBOR_REGION, seed);
  const ticks = Math.ceil(MAX_SECONDS / DT);
  for (let i = 0; i < ticks && state.status === 'running'; i++) {
    policy(state);
    step(state, DT);
  }
  return state;
}

const actOnThreats = (s, action) => {
  for (const id in s.nodes) if (s.nodes[id].threat) applyAction(s, id, action);
};
const restoreAll = (s) => {
  for (const id in s.nodes) if (!s.nodes[id].online) applyAction(s, id, 'restore');
};

const POLICIES = {
  'do nothing': () => {},
  'hunt + restore': (s) => {
    actOnThreats(s, 'hunt');
    restoreAll(s);
  },
  'isolate threats (free)': (s) => actOnThreats(s, 'isolate'),
  'segment then hunt': (s) => {
    actOnThreats(s, 'segment');
    actOnThreats(s, 'hunt');
    restoreAll(s);
  }
};

console.log('Grid Defense Command — difficulty report');
console.log(`scenario: ${HARBOR_REGION.name}   seeds: ${SEEDS.length}   window: ${MAX_SECONDS}s\n`);

const rows = [];
for (const [name, policy] of Object.entries(POLICIES)) {
  let survived = 0;
  let lost = 0;
  let score = 0;
  for (const seed of SEEDS) {
    const s = run(seed, policy);
    survived += s.t;
    score += s.score;
    if (s.status === 'lost') lost += 1;
  }
  rows.push({
    policy: name,
    'mean survival': `${(survived / SEEDS.length).toFixed(1)}s`,
    'runs lost': `${lost}/${SEEDS.length}`,
    'mean score': Math.round(score / SEEDS.length)
  });
}
console.table(rows);

console.log('power flow (served load fraction):');
const s = createState(HARBOR_REGION, 1);
console.log(`  ${'all online'.padEnd(32)} ${powerFlow(s).toFixed(3)}`);
s.nodes.S2.online = false;
console.log(`  ${'Substation 2 lost'.padEnd(32)} ${powerFlow(s).toFixed(3)}`);
s.nodes.P1.online = false;
console.log(`  ${'Substation 2 + hydro dam lost'.padEnd(32)} ${powerFlow(s).toFixed(3)}`);
s.nodes.S3.online = false;
console.log(`  ${'+ Substation 3 lost'.padEnd(32)} ${powerFlow(s).toFixed(3)}`);
