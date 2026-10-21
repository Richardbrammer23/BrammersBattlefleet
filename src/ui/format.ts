import type { Mode } from '../engine';
import { MODES } from '../engine';

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

export const modeName = (m: Mode) => MODES[m].shortName;
export const colLabel = (c: number) => String.fromCharCode(65 + c);
export const cellLabel = (r: number, c: number) => `${colLabel(c)}${r + 1}`;
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const OPPONENT = 'Captain Brammer';
