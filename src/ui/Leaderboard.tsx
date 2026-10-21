import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type Leaderboard as LB } from '../api';
import type { Mode } from '../engine';
import { Avatar } from './Avatar';
import { formatDate, formatDuration, modeName } from './format';

type Filter = Mode | 'overall';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'devin', label: 'Devin' },
  { id: 'codeassist', label: 'Code Assist' },
  { id: 'traditional', label: 'Traditional Coding' },
];

interface Props {
  limit?: number;
  compact?: boolean;
  refreshKey?: unknown;
  highlightGameId?: string | null;
  onViewAll?: () => void;
  title?: string;
}

export function Leaderboard({ limit = 10, compact, refreshKey, highlightGameId, onViewAll, title = 'Global Leaderboard' }: Props) {
  const [filter, setFilter] = useState<Filter>('overall');
  const [data, setData] = useState<LB | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.leaderboard(filter, limit));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [filter, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className={`panel leaderboard ${compact ? 'compact' : ''}`} aria-labelledby="lb-title" data-testid="leaderboard">
      <header className="panel-head">
        <h2 id="lb-title">{title}</h2>
        <div className="lb-filters" role="tablist" aria-label="Leaderboard filter">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && data.entries.length === 0 && <p className="muted empty">No verified victories yet. Be the first on the board!</p>}
      {data && data.entries.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Mode</th>
                {!compact && <th scope="col">Assistance</th>}
                <th scope="col" title="Human turns used to win">Turns</th>
                <th scope="col">Time</th>
                {!compact && <th scope="col">Date</th>}
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.gameId} className={e.gameId === highlightGameId ? 'mine' : ''}>
                  <td className={`rank r${e.rank}`}>{e.rank}</td>
                  <td>
                    <span className="lb-player">
                      <Avatar config={e.avatar} size={compact ? 26 : 32} title={`${e.displayName}'s avatar`} />
                      <span className="lb-name">{e.displayName}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`mode-pill ${e.mode}`}>{modeName(e.mode)}</span>
                  </td>
                  {!compact && <td className="muted small">{e.assistanceStatus}</td>}
                  <td className="mono strong">{e.humanTurns}</td>
                  <td className="mono">{formatDuration(e.durationMs)}</td>
                  {!compact && <td className="muted small">{formatDate(e.endedAt)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="lb-foot">
        <span className="muted small">Ranked by fewest human turns, then fastest time. Not normalised by mode.</span>
        {onViewAll && data && (
          <button className="link" onClick={onViewAll}>
            View full leaderboard ({data.total})
          </button>
        )}
      </footer>
    </section>
  );
}
