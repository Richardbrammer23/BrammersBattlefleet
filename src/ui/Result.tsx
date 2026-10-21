import { useEffect } from 'react';
import type { Player, Victory } from '../api';
import { MODES, type PublicGame } from '../engine';
import { Avatar } from './Avatar';
import { formatDuration, OPPONENT, prefersReducedMotion } from './format';
import { Leaderboard } from './Leaderboard';
import { play } from './sound';

interface Props {
  gameId: string;
  game: PublicGame;
  victory: Victory | null;
  player: Player;
  onPlayAgain: () => void;
  onLeaderboard: () => void;
  onHome: () => void;
}

export function Result({ gameId, game, victory, player, onPlayAgain, onLeaderboard, onHome }: Props) {
  const won = game.phase === 'won';
  useEffect(() => {
    play(won ? 'victory' : 'defeat');
  }, [won]);
  const s = game.stats;

  return (
    <main className={`page result ${won ? 'won' : 'lost'}`} data-testid="result">
      {won && !prefersReducedMotion() && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 40 }, (_, i) => (
            <i key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
      )}
      <section className="panel result-card">
        <p className="eyebrow">{MODES[game.mode].title}</p>
        <h1 data-testid="result-title">{won ? `Victory! ${OPPONENT}'s fleet destroyed` : `Defeat — ${OPPONENT} sank your fleet`}</h1>
        <div className="result-player">
          <Avatar config={player.avatar} size={72} />
          <div>
            <strong>{player.displayName}</strong>
            <span className="muted small">{game.assistanceStatus}</span>
          </div>
        </div>
        <dl className="result-stats">
          <div>
            <dt>Human turns</dt>
            <dd className="mono" data-testid="result-turns">
              {s.humanTurns}
            </dd>
          </div>
          <div>
            <dt>Completion time</dt>
            <dd className="mono">{formatDuration(s.durationMs)}</dd>
          </div>
          <div>
            <dt>Hit accuracy</dt>
            <dd className="mono">{Math.round(s.accuracy * 100)}%</dd>
          </div>
          <div>
            <dt>Longest hit streak</dt>
            <dd className="mono">{s.longestStreak}</dd>
          </div>
          {s.autoHits > 0 && (
            <div>
              <dt>Autonomous hits (Devin)</dt>
              <dd className="mono">{s.autoHits}</dd>
            </div>
          )}
          {won && (
            <div>
              <dt>Leaderboard rank</dt>
              <dd className="mono strong" data-testid="result-rank">
                {victory?.rank ? `#${victory.rank.overall}` : '—'}
                {victory?.rank && <span className="muted small"> overall · #{victory.rank.mode} in mode</span>}
              </dd>
            </div>
          )}
        </dl>
        {won && victory?.personalBest && <p className="pb-banner">New personal best for {MODES[game.mode].shortName}!</p>}
        {won && victory && victory.newAchievements.length > 0 && (
          <div className="new-achievements">
            <h2>Achievements unlocked</h2>
            <ul>
              {victory.newAchievements.map((a) => (
                <li key={a.code}>
                  <Avatar config={player.avatar} size={28} />
                  <span className="medal">★</span> <strong>{a.name}</strong> <span className="muted small">{a.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="muted small">Accuracy and streaks are shown for interest only. They don't affect ranking.</p>
        <div className="row-actions">
          <button className="btn ghost" onClick={onHome}>
            Home
          </button>
          <button className="btn ghost" onClick={onLeaderboard} data-testid="view-leaderboard">
            View Leaderboard
          </button>
          <button className="btn primary" onClick={onPlayAgain} data-testid="play-again">
            Play Again
          </button>
        </div>
      </section>
      <Leaderboard compact highlightGameId={gameId} refreshKey={gameId} title="Leaderboard" />
    </main>
  );
}
