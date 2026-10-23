import { useSyncExternalStore } from 'react';
import { soundStatus, subscribeSound } from './sound';

/** Browsers hold sound until the first tap or key press; this tells the player why it's quiet. Any tap dismisses it. */
export function SoundHint() {
  const status = useSyncExternalStore(subscribeSound, soundStatus);
  if (status !== 'blocked') return null;
  return (
    <button className="sound-hint" data-testid="sound-hint">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      </svg>
      Tap anywhere for sound
    </button>
  );
}
