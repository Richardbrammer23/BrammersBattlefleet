/** Synthesised sound effects and ambience (Web Audio API) — no audio files or licensing required. */
type Cue =
  | 'activate'
  | 'merge'
  | 'fire'
  | 'hit'
  | 'miss'
  | 'sunk'
  | 'incoming'
  | 'enemyHit'
  | 'enemyMiss'
  | 'enemySunk'
  | 'victory'
  | 'defeat'
  | 'click';
export type Ambience = 'music' | 'sonar' | null;

const MUTE_KEY = 'bbf.muted';
let ctx: AudioContext | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
let unlocked = false;
let away = typeof document !== 'undefined' && document.hidden;
let wanted: Ambience = null;
let running: { kind: Exclude<Ambience, null>; stop: () => void } | null = null;

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  syncAmbience();
}

/** Background music on menus, sonar during battle. */
export function setAmbience(a: Ambience) {
  wanted = a;
  syncAmbience();
}

/**
 * 'blocked': the browser is holding sound until the first tap or key press (autoplay rules).
 * 'paused': the player has switched tab, window or app.
 */
export type SoundStatus = 'unsupported' | 'muted' | 'blocked' | 'paused' | 'playing';
const listeners = new Set<() => void>();
export function soundStatus(): SoundStatus {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return 'unsupported';
  if (muted) return 'muted';
  if (!unlocked) return 'blocked';
  return away ? 'paused' : 'playing';
}
export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function publish() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.sound = soundStatus();
    if (ctx) document.documentElement.dataset.audioContext = ctx.state;
  }
  listeners.forEach((fn) => fn());
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    ctx.addEventListener('statechange', () => {
      if (ctx?.state === 'running' && !away) unlock();
      publish();
    });
    if (ctx.state === 'running') queueMicrotask(unlock);
  }
  if (ctx.state === 'suspended' && !away) ctx.resume().catch(() => {});
  return ctx;
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  for (const e of GESTURES) window.removeEventListener(e, askForSound, GESTURE_OPTS);
  syncAmbience();
}

/**
 * Browsers only grant sound for some gestures (a finger's pointerdown doesn't count, its touchend does),
 * so ask again on every tap, click or keystroke - including in text fields - until audio is really running.
 */
const GESTURES = ['pointerdown', 'pointerup', 'mousedown', 'click', 'touchstart', 'touchend', 'keydown', 'keyup', 'input'] as const;
const GESTURE_OPTS = { capture: true, passive: true } as const;

function askForSound() {
  if (!unlocked) audio();
}

/** Pause everything while the game isn't in view (other tab, minimised window, another app); resume on return. */
function setAway(a: boolean) {
  if (away === a) return;
  away = a;
  if (ctx && unlocked) (a ? ctx.suspend() : ctx.resume()).catch(() => {});
  publish();
}

if (typeof window !== 'undefined') {
  for (const e of GESTURES) window.addEventListener(e, askForSound, GESTURE_OPTS);
  document.addEventListener('visibilitychange', () => setAway(document.hidden));
  window.addEventListener('blur', () => setAway(true));
  window.addEventListener('focus', () => setAway(document.hidden));
  window.addEventListener('pagehide', () => setAway(true));
  window.addEventListener('pageshow', () => setAway(document.hidden));
  // Start straight away when the browser allows it (e.g. a site the visitor often plays sound on);
  // otherwise the context stays suspended until the first gesture.
  const policy = (navigator as Navigator & { getAutoplayPolicy?: (t: 'audiocontext') => string }).getAutoplayPolicy?.('audiocontext');
  if (!muted && policy !== 'disallowed') audio();
  publish();
}

function syncAmbience() {
  const target = muted || !unlocked ? null : wanted;
  if ((running?.kind ?? null) !== target) {
    running?.stop();
    running = null;
    const ac = target && audio();
    if (target && ac) running = { kind: target, stop: startAmbience(ac, target) };
  }
  publish();
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number) {
  note(ac, ac.destination, freq, ac.currentTime + start, dur, type, gain, slideTo);
}

function note(ac: AudioContext, dest: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, detune = 0) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseBuffer(ac: AudioContext, dur: number, fade: boolean) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (fade ? 1 - i / data.length : 1);
  return buf;
}

function noise(ac: AudioContext, start: number, dur: number, gain = 0.25, lowpass = 800) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur, true);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(ac.currentTime + start);
}

export function play(cue: Cue) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  switch (cue) {
    case 'activate':
      [440, 660, 880, 1320].forEach((f, i) => tone(ac, f, i * 0.07, 0.18, 'sine', 0.08));
      tone(ac, 220, 0, 0.5, 'triangle', 0.05, 880);
      break;
    case 'merge':
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.09, 0.25, 'triangle', 0.1));
      break;
    case 'fire':
      tone(ac, 900, 0, 0.12, 'square', 0.03, 300);
      break;
    case 'hit':
      noise(ac, 0, 0.35, 0.35, 1200);
      tone(ac, 120, 0, 0.3, 'sawtooth', 0.08, 50);
      break;
    case 'miss':
      noise(ac, 0, 0.3, 0.12, 2500);
      break;
    case 'sunk':
      noise(ac, 0, 0.8, 0.4, 600);
      tone(ac, 200, 0.05, 0.7, 'sawtooth', 0.08, 40);
      break;
    case 'incoming':
      tone(ac, 1600, 0, 0.5, 'sine', 0.035, 380);
      break;
    case 'enemyHit':
      noise(ac, 0, 0.6, 0.5, 700);
      tone(ac, 90, 0, 0.55, 'sawtooth', 0.1, 32);
      tone(ac, 260, 0.02, 0.2, 'square', 0.03, 90);
      break;
    case 'enemyMiss':
      noise(ac, 0, 0.55, 0.16, 1800);
      [620, 480, 700].forEach((f, i) => tone(ac, f, 0.12 + i * 0.07, 0.08, 'sine', 0.025, f / 2));
      break;
    case 'enemySunk':
      noise(ac, 0, 1.1, 0.5, 500);
      tone(ac, 150, 0.05, 1.0, 'sawtooth', 0.09, 28);
      tone(ac, 70, 0.3, 1.2, 'triangle', 0.08, 40);
      break;
    case 'victory':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.12, 0.3, 'triangle', 0.1));
      break;
    case 'defeat':
      [392, 330, 262, 196].forEach((f, i) => tone(ac, f, i * 0.18, 0.35, 'sine', 0.1));
      break;
    case 'click':
      tone(ac, 1200, 0, 0.04, 'sine', 0.04);
      break;
  }
}

// ---- Ambience ----

const midi = (m: number) => 440 * 2 ** ((m - 69) / 12);
const EIGHTH = 0.22;
// An original 8-bar shanty-style tune in D dorian, 6/8 time: [midi note, length in eighths].
const MELODY: [number, number][] = [
  [62, 2], [65, 1], [69, 2], [69, 1],
  [67, 2], [65, 1], [64, 3],
  [60, 2], [64, 1], [67, 2], [67, 1],
  [65, 2], [64, 1], [62, 3],
  [69, 2], [72, 1], [74, 2], [72, 1],
  [69, 2], [67, 1], [65, 3],
  [64, 2], [67, 1], [65, 1], [64, 1], [60, 1],
  [62, 6],
];
const BASS_ROOTS = [38, 36, 36, 38, 41, 38, 36, 38];
const MELODY_AT = new Map<number, [number, number]>();
MELODY.reduce((at, n) => (MELODY_AT.set(at, n), at + n[1]), 0);
const LOOP_EIGHTHS = 48;

function waves(ac: AudioContext, dest: AudioNode, level: number) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 4, false);
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 450;
  const g = ac.createGain();
  g.gain.value = level;
  const lfo = ac.createOscillator();
  const depth = ac.createGain();
  lfo.frequency.value = 0.11;
  depth.gain.value = level * 0.8;
  lfo.connect(depth).connect(g.gain);
  src.connect(f).connect(g).connect(dest);
  src.start();
  lfo.start();
  return () => {
    src.stop();
    lfo.stop();
  };
}

function musicStep(ac: AudioContext, dest: AudioNode, step: number, t: number) {
  const i = step % LOOP_EIGHTHS;
  const m = MELODY_AT.get(i);
  if (m) {
    const dur = m[1] * EIGHTH * 0.95;
    // Two detuned saws through a soft filter give an accordion-like reed.
    note(ac, dest, midi(m[0]), t, dur, 'sawtooth', 0.018, undefined, -7);
    note(ac, dest, midi(m[0]), t, dur, 'sawtooth', 0.018, undefined, 7);
  }
  if (i % 3 === 0) {
    const root = BASS_ROOTS[Math.floor(i / 6)];
    note(ac, dest, midi(i % 6 === 0 ? root : root + 7), t, EIGHTH * 2.6, 'triangle', 0.06);
  }
  return EIGHTH;
}

function sonarStep(ac: AudioContext, dest: AudioNode, echo: AudioNode, t: number) {
  note(ac, dest, 1320, t, 1.6, 'sine', 0.05, 1270);
  note(ac, echo, 1320, t, 1.6, 'sine', 0.05, 1270);
  return 3.2;
}

function startAmbience(ac: AudioContext, kind: Exclude<Ambience, null>): () => void {
  const bus = ac.createGain();
  const reed = ac.createBiquadFilter();
  reed.type = 'lowpass';
  reed.frequency.value = 1600;
  reed.connect(bus);
  bus.gain.setValueAtTime(0.0001, ac.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.5);
  bus.connect(ac.destination);
  const stops = [waves(ac, bus, kind === 'music' ? 0.03 : 0.018)];

  // Sonar echo: feedback delay with a darkening filter in the loop.
  const delay = ac.createDelay(1);
  delay.delayTime.value = 0.42;
  const fb = ac.createGain();
  fb.gain.value = 0.38;
  const dark = ac.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 1800;
  delay.connect(dark).connect(fb).connect(delay);
  dark.connect(bus);
  if (kind === 'sonar') {
    const hum = ac.createOscillator();
    const hg = ac.createGain();
    hum.frequency.value = 55;
    hg.gain.value = 0.02;
    hum.connect(hg).connect(bus);
    hum.start();
    stops.push(() => hum.stop());
  }

  let next = ac.currentTime + 0.15;
  let step = 0;
  const tick = () => {
    if (next < ac.currentTime - 0.2) next = ac.currentTime + 0.05; // tab was throttled; skip, don't burst
    while (next < ac.currentTime + 0.5) {
      next += kind === 'music' ? musicStep(ac, reed, step, next) : sonarStep(ac, bus, delay, next);
      step++;
    }
  };
  tick();
  const id = window.setInterval(tick, 150);
  return () => {
    clearInterval(id);
    const t = ac.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    window.setTimeout(() => {
      stops.forEach((s) => s());
      bus.disconnect();
    }, 700);
  };
}
