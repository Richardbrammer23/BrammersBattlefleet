/** Tiny synthesised sound effects (Web Audio API) — no audio files or licensing required. */
type Cue = 'activate' | 'merge' | 'fire' | 'hit' | 'miss' | 'sunk' | 'victory' | 'defeat' | 'click';

const MUTE_KEY = 'bbf.muted';
let ctx: AudioContext | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? '1' : '0');
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

function noise(ac: AudioContext, start: number, dur: number, gain = 0.25, lowpass = 800) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
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
