/**
 * Sound.
 *
 * Presentation layer, not engine — it consumes events and knows nothing about
 * the simulation.
 *
 * Cues are synthesised with WebAudio rather than shipped as audio files: no
 * assets to load, no bundle weight, and it works offline and from file://. The
 * `synth` function is the only thing you need to replace to swap in recorded
 * samples later; the `cue(name)` API stays the same.
 *
 * Muted by default. Browsers block audio until a user gesture, so we unlock on
 * the first pointer or key event and no-op until then.
 */

const STORAGE_KEY = 'watchfloor.audio';

let audioCtx = null;
let audioMaster = null;
let on = false;

/**
 * Cue definitions: [frequency, offset, duration, waveform, peak gain].
 * Short, low, and few — five cues, not fifty.
 */
const CUES = {
  ui: { notes: [[720, 0, 0.05, 'square', 0.022]] },
  alert: { notes: [[520, 0, 0.09, 'triangle', 0.05], [780, 0.07, 0.11, 'triangle', 0.042]] },
  contained: { notes: [[660, 0, 0.07, 'sine', 0.05], [440, 0.06, 0.13, 'sine', 0.038]] },
  breach: { notes: [[150, 0, 0.3, 'sawtooth', 0.055], [92, 0, 0.42, 'sine', 0.05]] },
  lost: {
    notes: [
      [330, 0, 0.22, 'sine', 0.055],
      [262, 0.18, 0.22, 'sine', 0.05],
      [196, 0.36, 0.46, 'sine', 0.05]
    ]
  }
};

function ensureContext() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  audioMaster = audioCtx.createGain();
  audioMaster.gain.value = 0.5;
  audioMaster.connect(audioCtx.destination);
  return audioCtx;
}

/** Call once at startup. Sets up the gesture that unlocks audio on autoplay-restricted browsers. */
export function initAudio() {
  const c = ensureContext();
  if (!c) return;
  const unlock = () => {
    if (c.state === 'suspended') c.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function isEnabled() {
  return on;
}

export function setEnabled(value) {
  on = !!value;
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* private mode, storage disabled — sound simply will not persist */
  }
  if (on) {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume();
  }
  return on;
}

export function toggle() {
  return setEnabled(!on);
}

/** Read the persisted preference. Muted unless the player has opted in. */
export function restore() {
  try {
    on = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    on = false;
  }
  return on;
}

/**
 * Play one cue immediately.
 * @param {string} name
 */
export function cue(name) {
  if (!on) return;
  const c = ensureContext();
  if (!c || !audioMaster) return;
  // Still waiting on a user gesture — resume and skip this one rather than queue it.
  if (c.state === 'suspended') {
    c.resume();
    return;
  }
  const spec = CUES[name];
  if (!spec) return;

  const t0 = c.currentTime + 0.001;
  for (const [freq, at, dur, type, gain] of spec.notes) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0 + at);
    // exponential ramps cannot reach zero, hence the small floor
    env.gain.setValueAtTime(0.0001, t0 + at);
    env.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(env).connect(audioMaster);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.03);
  }
}

let lastCueAt = 0;

/** Priority when several events land in the same tick. */
const RANK = { lost: 5, breach: 4, alert: 3, contained: 2, ui: 1 };

/**
 * Play the most important cue from a batch of engine events.
 *
 * Throttled: a tick can emit several events, and a burst of lateral-movement
 * alerts should not machine-gun the speakers.
 *
 * @param {Array<{cue?:string|null}>} events
 * @param {number} [now]
 */
export function cueForEvents(events, now = performance.now()) {
  if (!on || !events || !events.length) return;
  if (now - lastCueAt < 170) return;

  let best = null;
  for (const e of events) {
    if (!e.cue) continue;
    if (best === null || (RANK[e.cue] || 0) > (RANK[best] || 0)) best = e.cue;
  }
  if (best === null) return;

  lastCueAt = now;
  cue(best);
}
