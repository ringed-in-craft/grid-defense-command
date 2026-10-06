/**
 * Entry point: wiring between the canvas, the DOM, input, and the engine.
 *
 * The loop is fixed-dt-ish (clamped frame delta) and the seed comes from the
 * URL hash, so a run can be linked to and reproduced exactly:
 *   index.html#seed=1234
 *
 * Note the named imports rather than a namespace import. That is deliberate:
 * scripts/bundle.mjs inlines these modules by stripping module syntax, and a
 * `import * as ns` would leave the namespace binding undefined in the bundle.
 */

import { createState, step, applyAction, isBlind, ACTION_ORDER, ACTIONS, SCENARIOS } from './sim.js';
import { draw } from './render.js';
import {
  buildActionButtons,
  clearFeed,
  pushEvents,
  renderHUD,
  renderNodePanel,
  showOverlay,
  hideOverlay,
  overlayVisible,
  initSound,
  fmtTime
} from './ui.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

let W = 0;
let H = 0;
let state = null;
let paused = true; // stays paused behind the intro overlay
let selected = null;
let hover = null;
let rafId = 0;
let frames = 0;
let last = 0;

/** Read the seed (and optional scenario) from the URL hash. */
function readConfig() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const seed = Number.parseInt(params.get('seed') || '', 10);
  const scenarioId = params.get('scenario') || 'harbor-region';
  return {
    seed: Number.isFinite(seed) ? seed : 1,
    scenario: SCENARIOS[scenarioId] || SCENARIOS['harbor-region']
  };
}

function shareLink(seed) {
  return `${location.origin}${location.pathname}#seed=${seed}`;
}

function resize() {
  const rect = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  W = rect.width;
  H = rect.height;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function nodeAt(clientX, clientY) {
  const rect = cv.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  let bestD = 34;
  for (const id in state.nodes) {
    const n = state.nodes[id];
    const d = Math.hypot(n.x * W - x, n.y * H - y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function act(actionId) {
  if (!state || state.status !== 'running') return;
  const res = applyAction(state, selected, actionId);
  if (res.ok) pushEvents(res.events);
}

function reset(seed) {
  const cfg = readConfig();
  state = createState(cfg.scenario, seed);
  paused = false;
  selected = null;
  hover = null;
  clearFeed();
  pushEvents([
    { type: 'ok', nodeId: null, message: 'Grid online. Stay sharp.' },
    {
      type: 'learn',
      nodeId: null,
      message:
        'Hardening slows a threat, rate-limiting blocks it outright, hunting removes it, ' +
        'segmenting stops it spreading, and isolating purges it at the cost of the power it carries.'
    }
  ]);
  hideOverlay();
}

function gameOver() {
  const cfg = readConfig();
  state.status = 'lost';
  showOverlay(
    'Grid lost',
    [
      `You kept the lights on for ${fmtTime(state.t)} and scored ${Math.floor(state.score)}.`,
      `Load served at the end: ${Math.round(state.service * 100)}%. Blackouts: ${state.blackouts}. Threats neutralised: ${state.kills}.`,
      'Harden the hubs early, keep the control centre alive, and segment before you isolate.',
      `This run was seed ${cfg.seed}. Reproduce it: ${shareLink(cfg.seed)}`
    ],
    'Run it back',
    () => reset(cfg.seed)
  );
}

function intro() {
  const cfg = readConfig();
  showOverlay(
    'Grid defense command',
    [
      'Attackers are coming for the power grid. Click a node, then choose a response.',
      'Keep the hospital and the cities lit for as long as you can.',
      'Keys 1-6 fire the selected action. Space pauses. The control centre is your eyes: lose it and you go blind.',
      `Seed ${cfg.seed}.`
    ],
    'Take command',
    () => reset(cfg.seed)
  );
}

/**
 * One frame of the real loop: advance the simulation, refresh the UI, redraw.
 *
 * Factored out of the rAF callback for a concrete reason — `requestAnimationFrame`
 * does not run reliably under headless/virtual-time browser testing, so the
 * browser smoke test drives this directly via __gdc.frame(). Same code path,
 * deterministic timing.
 */
function frame(dt, ts) {
  if (state && state.status === 'running' && !paused) {
    pushEvents(step(state, dt));
  }
  if (!state) return;

  if (state.status === 'lost' && !overlayVisible()) gameOver();

  renderHUD(state, paused);
  renderNodePanel(state, selected);
  draw(ctx, state, {
    width: W,
    height: H,
    time: ts,
    selected,
    hover,
    blind: isBlind(state)
  });
}

function loop(ts) {
  frames += 1;
  const dt = Math.min(0.1, (ts - last) / 1000 || 0);
  last = ts;
  frame(dt, ts);
  rafId = requestAnimationFrame(loop);
}

// --- input ------------------------------------------------------------------

cv.addEventListener('click', (e) => {
  selected = nodeAt(e.clientX, e.clientY);
});

cv.addEventListener('mousemove', (e) => {
  hover = nodeAt(e.clientX, e.clientY);
});

cv.addEventListener('mouseleave', () => {
  hover = null;
});

window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '9') {
    const id = ACTION_ORDER.find((a) => ACTIONS[a].key === e.key);
    if (id) act(id);
  } else if (e.key === ' ') {
    if (state && state.status === 'running') {
      paused = !paused;
      e.preventDefault();
    }
  } else if (e.key === 'Escape') {
    selected = null;
  }
});

window.addEventListener('resize', resize);

// --- boot -------------------------------------------------------------------

resize();
buildActionButtons(act);
initSound('mute');
intro();

const cfg = readConfig();
state = createState(cfg.scenario, cfg.seed);
renderHUD(state, paused);
renderNodePanel(state, null);
rafId = requestAnimationFrame(loop);

export { reset, act };

/**
 * Debug / automation hook.
 *
 * Exposed deliberately: it lets a browser smoke test (test/browser-smoke.html)
 * drive the real UI — real canvas clicks, real buttons, real render loop —
 * without duplicating the markup. It is also how you reproduce a seeded run
 * from the console while tuning balance.
 */
window.__gdc = {
  get state() {
    return state;
  },
  get selected() {
    return selected;
  },
  select(id) {
    selected = id;
  },
  act,
  reset,
  pause(v) {
    paused = v;
  },
  tick(dt) {
    return step(state, dt);
  },
  /** Advance the real render/tick loop by one frame — used by the smoke test. */
  frame(dt = 0.1) {
    frame(dt, performance.now());
  },
  nodeAt,
  get frames() {
    return frames;
  },
  get dimensions() {
    return { width: W, height: H };
  }
};
