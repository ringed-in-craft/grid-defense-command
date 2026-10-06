/**
 * DOM binding layer. Reads state, writes DOM, and never mutates the simulation.
 *
 * Action buttons are generated from ACTIONS rather than hard-coded in the
 * markup, so adding a defender capability is a one-line change in sim.js.
 */

import { ACTIONS, ACTION_ORDER, canApply, isBlind } from './sim.js';
import { THREATS } from './threats.js';

const $ = (id) => document.getElementById(id);

let built = false;

/** Build the action button list once. */
export function buildActionButtons(onAction) {
  if (built) return;
  const host = $('acts');
  host.innerHTML = '';
  for (const id of ACTION_ORDER) {
    const a = ACTIONS[id];
    const btn = document.createElement('button');
    btn.id = `act-${id}`;
    btn.type = 'button';
    btn.innerHTML = `${a.key} ${a.name}<small>${a.hint}</small>`;
    btn.addEventListener('click', () => onAction(id));
    host.appendChild(btn);
  }
  built = true;
}

/** Head-up display: service, budget, score, clock, seed. */
export function renderHUD(state, paused) {
  const pct = Math.round(state.service * 100);
  $('sv').textContent = `${pct}%`;
  $('svb').style.width = `${pct}%`;
  $('bd').textContent = String(Math.floor(state.budget));
  $('bdb').style.width = `${(state.budget / 1.5).toFixed(0)}%`;
  $('sc').textContent = String(Math.floor(state.score));
  $('tm').textContent = fmtTime(state.t);
  $('seed').textContent = String(state.seed);
  $('pauseFlag').textContent = paused ? 'PAUSED' : '';
}

/** Detail panel for the selected node, plus live button enablement. */
export function renderNodePanel(state, selectedId) {
  const n = selectedId ? state.nodes[selectedId] : null;
  $('sn').textContent = n ? n.name : 'Select a node';
  $('ss').textContent = describe(state, n);

  const blind = isBlind(state);
  const banner = $('blind');
  if (blind) {
    banner.classList.remove('hide');
    banner.textContent = 'SENSOR FEED LOST — control centre has no power. Threats are escalating 50% faster and you cannot see them.';
  } else {
    banner.classList.add('hide');
  }

  for (const id of ACTION_ORDER) {
    const btn = $(`act-${id}`);
    if (!btn) continue;
    btn.disabled = !canApply(state, selectedId, id);
  }
}

/** Human-readable status of a node. */
function describe(state, n) {
  if (!n) return 'Click any node on the map.';
  if (n.type === 'net') return 'Where attacks originate. It cannot be defended — only contained.';
  if (!n.online) return 'Offline. Restore it to bring it back on the grid.';
  if (n.isolation > 0) return `Isolated for ${Math.ceil(n.isolation)}s — off the grid while it is dark.`;
  const parts = [];
  if (n.threat) {
    const spec = THREATS[n.threat.id];
    parts.push(isBlind(state) ? 'Something is wrong here (unknown, sensor feed lost)'
      : `${spec.name} at ${Math.floor(n.threat.progress)}%`);
  } else if (!isBlind(state)) {
    parts.push('Clean');
  }
  parts.push(`hardening ${n.hardening}/3`);
  if (n.segmented) parts.push('segmented');
  if (n.firewall > 0) parts.push(`rate-limited ${Math.ceil(n.firewall)}s`);
  return parts.join(' · ');
}

/** Prepend events to the field log, newest first. */
export function pushEvents(events) {
  const feed = $('feed');
  for (const e of events) {
    const div = document.createElement('div');
    div.className = e.type === 'bad' ? 'bad' : e.type === 'learn' ? 'learn' : 'ok';
    div.textContent = e.message;
    feed.prepend(div);
  }
  while (feed.children.length > 14) feed.lastElementChild.remove();
}

export function clearFeed() {
  $('feed').innerHTML = '';
}

/**
 * Show the intro / game-over overlay.
 * @param {string} heading
 * @param {string[]} paragraphs
 * @param {string} button
 * @param {() => void} onClick
 */
export function showOverlay(heading, paragraphs, button, onClick) {
  const ov = $('ov');
  ov.innerHTML = '';
  const box = document.createElement('div');
  const h = document.createElement('h1');
  h.textContent = heading;
  box.appendChild(h);
  for (const p of paragraphs) {
    const el = document.createElement('p');
    el.textContent = p;
    box.appendChild(el);
  }
  const btn = document.createElement('button');
  btn.id = 'go';
  btn.type = 'button';
  btn.textContent = button;
  btn.addEventListener('click', onClick);
  box.appendChild(btn);
  ov.appendChild(box);
  ov.classList.remove('hide');
  return btn;
}

export function hideOverlay() {
  $('ov').classList.add('hide');
}

/** Whether an overlay is currently visible (used to avoid re-showing one). */
export function overlayVisible() {
  const ov = $('ov');
  return ov !== null && !ov.classList.contains('hide');
}

/** mm:ss */
export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
