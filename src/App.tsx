import { useCallback, useEffect, useState } from 'react';
import { api, clearLegacyToken, errorMessage, ApiError, type Player, type Victory } from './api';
import { MODES, type Fleet, type Mode, type PublicGame } from './engine';
import { Avatar } from './ui/Avatar';
import { Battle } from './ui/Battle';
import { Home } from './ui/Home';
import { Leaderboard } from './ui/Leaderboard';
import { Placement } from './ui/Placement';
import { Profile } from './ui/Profile';
import { Result } from './ui/Result';
import { modeName } from './ui/format';
import { isMuted, play, setAmbience, setMuted } from './ui/sound';
import { Welcome } from './ui/Welcome';

type Screen =
  | { name: 'loading' }
  | { name: 'welcome' }
  | { name: 'home' }
  | { name: 'leaderboard' }
  | { name: 'profile' }
  | { name: 'placement'; mode: Mode }
  | { name: 'battle'; gameId: string; game: PublicGame; key: number }
  | { name: 'result'; gameId: string; game: PublicGame; victory: Victory | null };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [player, setPlayer] = useState<Player | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<Mode | null>(() => {
    const m = localStorage.getItem('bbf.lastMode');
    return m && m in MODES ? (m as Mode) : null;
  });

  useEffect(() => {
    setAmbience(screen.name === 'battle' ? 'sonar' : 'music');
  }, [screen.name]);

  useEffect(() => {
    const mode = screen.name === 'placement' ? screen.mode : screen.name === 'battle' || screen.name === 'result' ? screen.game.mode : null;
    if (mode) {
      setLastMode(mode);
      localStorage.setItem('bbf.lastMode', mode);
    }
  }, [screen]);

  useEffect(() => {
    const seed = new URLSearchParams(location.search).get('testSeed');
    if (seed) sessionStorage.setItem('bbf.testSeed', seed);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fastAi')) sessionStorage.setItem('bbf.fastAi', '1');
    (async () => {
      try {
        const me = await api.me();
        clearLegacyToken();
        setPlayer(me.player);
        const active = await api.activeGame();
        if (active.id && active.game) setScreen({ name: 'battle', gameId: active.id, game: active.game, key: Date.now() });
        else setScreen({ name: 'home' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearLegacyToken();
          setScreen({ name: 'welcome' });
        } else {
          setError(errorMessage(e));
          setScreen({ name: 'home' });
        }
      }
    })();
  }, []);

  const go = useCallback((s: Screen) => {
    setError(null);
    setScreen(s);
    window.scrollTo({ top: 0 });
  }, []);

  const startBattle = async (mode: Mode, fleet: Fleet) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createGame(mode, fleet);
      go({ name: 'battle', gameId: r.id, game: r.game, key: Date.now() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) play('click');
  };

  if (screen.name === 'loading') return <div className="loading-screen">Establishing secure uplink…</div>;
  if (screen.name === 'welcome' || !player)
    return (
      <Welcome
        onDone={(p) => {
          setPlayer(p);
          go({ name: 'home' });
        }}
      />
    );

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go({ name: 'home' })}>
          <span className="brand-dot" aria-hidden />
          Brammers <span className="accent">BattleFleet</span> AI
        </button>
        <nav className="topnav">
          <button className="btn ghost small" onClick={() => go({ name: 'leaderboard' })}>
            Leaderboard
          </button>
          <button className="btn ghost small icon" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute sound' : 'Mute sound'} data-testid="mute">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" />
              {muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
            </svg>
          </button>
          <button className="profile-chip" onClick={() => go({ name: 'profile' })} data-testid="profile-chip">
            <Avatar config={player.avatar} size={32} />
            <span>{player.displayName}</span>
          </button>
        </nav>
      </header>
      {error && screen.name !== 'placement' && <p className="error banner">{error}</p>}

      {screen.name === 'home' && <Home onPlay={(m) => go({ name: 'placement', mode: m })} onViewLeaderboard={() => go({ name: 'leaderboard' })} />}
      {screen.name === 'leaderboard' && (
        <main className="page">
          <div className="page-head">
            <button className="btn ghost" onClick={() => go({ name: 'home' })}>
              ← Back
            </button>
            <h1>Full leaderboard</h1>
            <button
              className="btn primary page-head-action"
              onClick={() => go(lastMode ? { name: 'placement', mode: lastMode } : { name: 'home' })}
              data-testid="leaderboard-play-again"
            >
              {lastMode ? `Play again — ${modeName(lastMode)}` : 'Play now'}
            </button>
          </div>
          <Leaderboard limit={100} title="All verified victories (top 100)" />
        </main>
      )}
      {screen.name === 'profile' && <Profile player={player} onSaved={setPlayer} onBack={() => go({ name: 'home' })} />}
      {screen.name === 'placement' && (
        <Placement mode={screen.mode} busy={busy} error={error} onStart={(f) => void startBattle(screen.mode, f)} onBack={() => go({ name: 'home' })} />
      )}
      {screen.name === 'battle' && (
        <Battle
          key={screen.key}
          gameId={screen.gameId}
          initial={screen.game}
          player={player}
          onFinished={(r) => go({ name: 'result', ...r })}
          onRestart={() => go({ name: 'placement', mode: screen.game.mode })}
          onHome={() => go({ name: 'home' })}
        />
      )}
      {screen.name === 'result' && (
        <Result
          gameId={screen.gameId}
          game={screen.game}
          victory={screen.victory}
          player={player}
          onPlayAgain={() => go({ name: 'placement', mode: screen.game.mode })}
          onLeaderboard={() => go({ name: 'leaderboard' })}
          onHome={() => go({ name: 'home' })}
        />
      )}
      <footer className="footer muted small">
        Brammers BattleFleet AI is an independent demo. It is not affiliated with or endorsed by Cognition. The Devin mark shown is an original, unofficial
        representation.
      </footer>
    </div>
  );
}
