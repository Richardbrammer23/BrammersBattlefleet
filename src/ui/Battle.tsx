import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, type FireResponse, type Player } from '../api';
import { MODES, shipCells, SHIPS, type AssistDecision, type PublicGame, type Shot } from '../engine';
import { Avatar } from './Avatar';
import { Board, type CellView } from './Board';
import { CodeAssistBot, DevinMark } from './Characters';
import { cellLabel, formatDuration, OPPONENT, prefersReducedMotion } from './format';
import { Leaderboard } from './Leaderboard';
import { play } from './sound';

interface Props {
  gameId: string;
  initial: PublicGame;
  player: Player;
  onFinished: (r: { gameId: string; game: PublicGame; victory: FireResponse['victory'] }) => void;
  onRestart: () => void;
  onHome: () => void;
}

type IntroStage = 'appear' | 'offer' | 'merging' | 'autonomous' | 'outcome' | 'done';

/** Captain Brammer "thinks" for about as long as a human would. Not shortened for reduced motion, so ranked times stay comparable. */
// Read per turn: App stores the dev-only fast flag after this module has loaded.
const aiTurnMs = () => (import.meta.env.DEV && sessionStorage.getItem('bbf.fastAi') === '1' ? 60 : 2000);

const COPY = {
  devinOffer:
    "Mission complete! I've autonomously identified and prepared attacks against 52.9% of the enemy fleet — 9 of 17 ship cells. I've created a pull request containing the completed work, ready for your review.",
  devinMerged: 'PR merged successfully. Devin completed 52.9% of your mission autonomously. Zero human turns used. Your mission begins now!',
  devinDeclined:
    "You've declined Devin's pull request and chosen to complete the work manually. Devin has highlighted the 9 identified targets, but you'll need to execute each attack yourself. Every shot counts towards your total turns.",
  caOffer: "I've identified 17.6% of the enemy fleet — 3 of 17 ship cells. I can show you where the targets are, but you'll need to execute the attacks yourself.",
  caAccepted: 'Code Assist has highlighted 3 identified targets. Every shot you fire counts towards your total turns.',
  caDeclined:
    "You've chosen to complete the work manually. Code Assist has left 1 of the 3 identified targets highlighted, but you'll need to fire at it yourself. Every shot counts towards your total turns.",
  traditional: "Traditional Coding — no autonomous assistance, no suggested targets. You're responsible for every shot.",
};

function shotMap(shots: Shot[]) {
  return new Map(shots.map((s) => [`${s.r},${s.c}`, s]));
}

export function Battle({ gameId, initial, player, onFinished, onRestart, onHome }: Props) {
  const [game, setGame] = useState(initial);
  const [visibleAuto, setVisibleAuto] = useState(initial.phase === 'briefing' ? 0 : Infinity);
  const [stage, setStage] = useState<IntroStage>(initial.phase === 'briefing' ? (initial.decision ? 'outcome' : 'appear') : 'done');
  const [aiThinking, setAiThinking] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<'enemy' | 'own'>('enemy');
  const [showBoard, setShowBoard] = useState(false);
  const [lastShots, setLastShots] = useState<{ player?: string; ai?: string }>({});
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const fast = prefersReducedMotion();

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, fast ? Math.min(ms, 80) : ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Intro: assistant appears, then the offer.
  useEffect(() => {
    if (stage !== 'appear') return;
    if (game.mode !== 'traditional') play('activate');
    later(() => setStage('offer'), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Timer tick.
  useEffect(() => {
    if (game.phase !== 'playing') return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [game.phase]);

  const showToast = (text: string, kind: string) => {
    setToast({ text, kind });
    // Not shortened for reduced motion: the message still needs time to be read.
    timers.current.push(window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2200));
  };

  const decide = async (decision: AssistDecision) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      if (decision === 'merge') setStage('merging');
      const r = await api.assist(gameId, decision);
      if (decision === 'merge') {
        play('merge');
        later(() => {
          setStage('autonomous');
          const auto = r.game.playerShots.filter((s) => s.auto);
          auto.forEach((s, i) =>
            later(() => {
              setVisibleAuto(i + 1);
              play(s.result === 'sunk' ? 'sunk' : 'hit');
              if (i === auto.length - 1) later(() => setStage('outcome'), 700);
            }, 280 * (i + 1)),
          );
        }, 900);
      } else {
        setStage('outcome');
      }
      setGame(r.game);
    } catch (e) {
      setError(errorMessage(e));
      setStage('offer');
    } finally {
      busy.current = false;
    }
  };

  const begin = async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const r = await api.start(gameId);
      setOffset(Date.now() - (r.game.startedAt ?? Date.now()));
      setGame(r.game);
      setVisibleAuto(Infinity);
      setStage('done');
      play('click');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busy.current = false;
    }
  };

  const fireAt = async (r: number, c: number) => {
    if (busy.current || game.phase !== 'playing') return;
    busy.current = true;
    setError(null);
    play('fire');
    try {
      const res = await api.fire(gameId, { r, c });
      const prevAi = game.aiShots.length;
      // Show the human's shot first, then Captain Brammer "thinking" before revealing his reply.
      setGame({ ...res.game, aiShots: res.game.aiShots.slice(0, prevAi) });
      setLastShots({ player: `${r},${c}` });
      const ps = res.playerShot;
      play(ps.result === 'miss' ? 'miss' : ps.result === 'sunk' ? 'sunk' : 'hit');
      showToast(
        ps.result === 'sunk'
          ? `You sank the enemy ${SHIPS.find((s) => s.id === ps.sunkShip)?.name}!`
          : ps.result === 'hit'
            ? `Hit at ${cellLabel(r, c)}!`
            : `Miss at ${cellLabel(r, c)}.`,
        ps.result,
      );
      if (res.game.phase === 'won') {
        later(() => onFinished({ gameId, game: res.game, victory: res.victory }), 900);
        return;
      }
      setAiThinking(true);
      const delay = aiTurnMs();
      if (delay > 600) timers.current.push(window.setTimeout(() => play('incoming'), delay - 500));
      timers.current.push(
        window.setTimeout(() => {
          setGame(res.game);
          setAiThinking(false);
          const ai = res.aiShot!;
          setLastShots({ player: `${r},${c}`, ai: `${ai.r},${ai.c}` });
          play(ai.result === 'sunk' ? 'enemySunk' : ai.result === 'hit' ? 'enemyHit' : 'enemyMiss');
          showToast(
            ai.result === 'sunk'
              ? `${OPPONENT} sank your ${SHIPS.find((s) => s.id === ai.sunkShip)?.name}!`
              : ai.result === 'hit'
                ? `${OPPONENT} hit your fleet at ${cellLabel(ai.r, ai.c)}!`
                : `${OPPONENT} missed at ${cellLabel(ai.r, ai.c)}.`,
            ai.result === 'miss' ? 'enemy-miss' : 'enemy',
          );
          if (res.game.phase === 'lost') later(() => onFinished({ gameId, game: res.game, victory: null }), 1200);
          else busy.current = false;
        }, delay),
      );
    } catch (e) {
      setError(errorMessage(e));
      busy.current = false;
    }
  };

  const size = game.size;
  const autoShots = game.playerShots.filter((s) => s.auto);
  const shownPlayerShots = useMemo(
    () => [...autoShots.slice(0, visibleAuto), ...game.playerShots.filter((s) => !s.auto)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.playerShots, visibleAuto],
  );
  const enemyKnown = shotMap(shownPlayerShots);
  const enemySunkCells = new Set(
    game.enemySunk.filter((s) => shownPlayerShots.some((x) => x.sunkShip === s.id)).flatMap(shipCells).map((p) => `${p.r},${p.c}`),
  );
  const revealed = new Set((game.enemyRevealed ?? []).flatMap(shipCells).map((p) => `${p.r},${p.c}`));
  const highlighted = new Set(game.highlighted.map((p) => `${p.r},${p.c}`));
  const ownShips = new Set(game.playerFleet.flatMap(shipCells).map((p) => `${p.r},${p.c}`));
  const aiKnown = shotMap(game.aiShots);
  const ownSunk = new Set(
    game.playerFleet.filter((s) => game.aiShots.some((x) => x.sunkShip === s.id)).flatMap(shipCells).map((p) => `${p.r},${p.c}`),
  );

  const enemyCell = (r: number, c: number): CellView => {
    const k = `${r},${c}`;
    const s = enemyKnown.get(k);
    return {
      state: enemySunkCells.has(k) ? 'sunk' : s ? (s.result === 'miss' ? 'miss' : 'hit') : revealed.has(k) ? 'ship' : 'empty',
      highlighted: highlighted.has(k),
      justHit: lastShots.player === k || (stage === 'autonomous' && autoShots[visibleAuto - 1] && `${autoShots[visibleAuto - 1].r},${autoShots[visibleAuto - 1].c}` === k),
      revealed: revealed.has(k) && !s,
    };
  };
  const ownCell = (r: number, c: number): CellView => {
    const k = `${r},${c}`;
    const s = aiKnown.get(k);
    return {
      state: ownSunk.has(k) ? 'sunk' : s ? (s.result === 'miss' ? 'miss' : 'hit') : ownShips.has(k) ? 'ship' : 'empty',
      justHit: lastShots.ai === k,
    };
  };

  const elapsed = game.phase === 'playing' && game.startedAt ? now - offset - game.startedAt : (game.stats.durationMs ?? 0);
  const yourTurn = game.phase === 'playing' && !aiThinking;
  const enemySunkIds = new Set(shownPlayerShots.filter((s) => s.sunkShip).map((s) => s.sunkShip));

  const restart = async () => {
    timers.current.forEach(clearTimeout);
    try {
      await api.abandon(gameId);
    } catch {
      /* starting a new game abandons it server-side anyway */
    }
    onRestart();
  };

  return (
    <main className="page battle" data-phase={game.phase} data-testid="battle">
      <div className="hud panel">
        <div className="hud-player">
          <Avatar config={player.avatar} size={40} />
          <div>
            <strong>{player.displayName}</strong>
            <span className={`mode-pill ${game.mode}`}>{MODES[game.mode].shortName}</span>
          </div>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Human turns</span>
          <span className="hud-value mono" data-testid="turns">
            {game.humanTurns}
          </span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Time</span>
          <span className="hud-value mono" data-testid="timer">
            {formatDuration(game.phase === 'briefing' ? 0 : elapsed)}
          </span>
        </div>
        <div className={`turn-indicator ${yourTurn ? 'yours' : 'theirs'}`} aria-live="polite" data-testid="turn-indicator">
          {game.phase === 'briefing' ? 'Briefing' : aiThinking ? (
            <>
              {OPPONENT} is targeting<span className="dots" />
            </>
          ) : game.phase === 'playing' ? (
            'Your turn — fire!'
          ) : game.phase === 'won' ? (
            'Victory'
          ) : (
            'Defeat'
          )}
        </div>
        <div className="hud-assist small muted">{game.assistanceStatus}</div>
        <div className="hud-actions">
          <button className="btn ghost small" onClick={() => setShowBoard(true)}>
            Leaderboard
          </button>
          <button className="btn ghost small" onClick={() => void restart()} data-testid="restart">
            Restart
          </button>
          <button className="btn ghost small" onClick={onHome}>
            Home
          </button>
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Board view">
        <button role="tab" aria-selected={view === 'enemy'} className={view === 'enemy' ? 'active' : ''} onClick={() => setView('enemy')}>
          Enemy waters
        </button>
        <button role="tab" aria-selected={view === 'own'} className={view === 'own' ? 'active' : ''} onClick={() => setView('own')}>
          Your fleet {game.aiShots.length ? `(${game.aiShots.filter((s) => s.result !== 'miss').length} hits taken)` : ''}
        </button>
      </div>

      <div className="boards" data-view={view}>
        <section className={`panel board-panel enemy ${yourTurn ? 'armed' : ''}`} aria-label="Enemy waters">
          <header className="board-head">
            <h2>{OPPONENT}'s waters</h2>
            <ShipHealth label="Enemy" sunk={enemySunkIds} />
          </header>
          <Board size={size} label="Enemy waters" testId="enemy-board" interactive={yourTurn} cell={enemyCell} onFire={(r, c) => void fireAt(r, c)} />
        </section>
        <section className="panel board-panel own" aria-label="Your fleet">
          <header className="board-head">
            <h2>Your fleet</h2>
            <ShipHealth label="Your" fleet={game.playerFleet.map((s) => ({ id: s.id, hits: shipCells(s).filter((p) => aiKnown.get(`${p.r},${p.c}`)).length }))} />
          </header>
          <Board size={size} label="Your fleet" testId="own-board" interactive={false} cell={ownCell} />
        </section>
      </div>

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
        </div>
      )}

      {game.phase === 'briefing' && stage !== 'autonomous' && (
        <Intro game={game} stage={stage} onDecide={(d) => void decide(d)} onBegin={() => void begin()} />
      )}
      {stage === 'autonomous' && (
        <div className="autonomous-banner" role="status">
          <DevinMark size={36} /> Devin is executing {autoShots.length} autonomous attacks… ({Math.min(visibleAuto, autoShots.length)}/{autoShots.length})
        </div>
      )}

      {showBoard && (
        <div className="drawer-backdrop" onClick={() => setShowBoard(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Leaderboard">
            <button className="btn ghost small close" onClick={() => setShowBoard(false)}>
              Close ✕
            </button>
            <Leaderboard compact />
          </div>
        </div>
      )}
    </main>
  );
}

function ShipHealth({ label, sunk, fleet }: { label: string; sunk?: Set<string | undefined>; fleet?: { id: string; hits: number }[] }) {
  return (
    <ul className="ship-health" aria-label={`${label} ship status`}>
      {SHIPS.map((s) => {
        const hits = fleet?.find((f) => f.id === s.id)?.hits ?? (sunk?.has(s.id) ? s.length : 0);
        const isSunk = hits >= s.length;
        return (
          <li key={s.id} className={isSunk ? 'sunk' : ''} title={`${s.name}: ${isSunk ? 'sunk' : fleet ? `${s.length - hits}/${s.length} intact` : 'afloat'}`}>
            <span className="sh-name">{s.name}</span>
            <span className="sh-bar">
              {Array.from({ length: s.length }, (_, i) => (
                <i key={i} className={fleet ? (i < hits ? 'dmg' : '') : isSunk ? 'dmg' : ''} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Intro({ game, stage, onDecide, onBegin }: { game: PublicGame; stage: IntroStage; onDecide: (d: AssistDecision) => void; onBegin: () => void }) {
  const mode = game.mode;
  const outcome =
    mode === 'devin'
      ? game.decision === 'merge'
        ? COPY.devinMerged
        : COPY.devinDeclined
      : mode === 'codeassist'
        ? game.decision === 'accept'
          ? COPY.caAccepted
          : COPY.caDeclined
        : COPY.traditional;
  const showOutcome = stage === 'outcome' || mode === 'traditional';

  return (
    <div className={`intro-overlay ${stage}`} data-testid="intro">
      <div className={`intro-card panel ${mode}`} role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div className="intro-character">
          {mode === 'devin' && <DevinMark size={88} className="appear" />}
          {mode === 'codeassist' && <CodeAssistBot size={88} className="appear" />}
          {mode === 'traditional' && <div className="trad-icon appear">⚓</div>}
        </div>

        {mode === 'devin' && !showOutcome && stage !== 'appear' && (
          <>
            <p className="speech">{COPY.devinOffer}</p>
            <div className={`pr-card ${stage === 'merging' ? 'merging' : ''}`} data-testid="pr-card">
              <div className="pr-head">
                <span className="pr-badge">{stage === 'merging' ? 'Merging…' : 'Open'}</span>
                <h2 id="intro-title">PR #001 — Autonomous Fleet Targeting</h2>
                <span className="sim-tag">Simulated in-game pull request (not a real GitHub PR)</span>
              </div>
              <dl className="pr-meta">
                <div>
                  <dt>Status</dt>
                  <dd>Ready for review</dd>
                </div>
                <div>
                  <dt>Enemy ship cells identified</dt>
                  <dd>9 / 17</dd>
                </div>
                <div>
                  <dt>Mission progress</dt>
                  <dd>52.9%</dd>
                </div>
                <div>
                  <dt>Human turns required</dt>
                  <dd>0</dd>
                </div>
                <div>
                  <dt>Validation</dt>
                  <dd className="ok">✓ 9 valid enemy ship cells identified</dd>
                </div>
                <div>
                  <dt>Review status</dt>
                  <dd>Awaiting human approval</dd>
                </div>
              </dl>
              <div className="pr-actions">
                <button className="btn merge" disabled={stage === 'merging'} onClick={() => onDecide('merge')} data-testid="merge-pr">
                  Merge Devin's PR — Execute 9 attacks automatically
                </button>
                <button className="btn ghost" disabled={stage === 'merging'} onClick={() => onDecide('decline')} data-testid="decline-pr">
                  Decline PR — Execute the identified attacks manually
                </button>
              </div>
            </div>
          </>
        )}

        {mode === 'codeassist' && !showOutcome && stage !== 'appear' && (
          <>
            <h2 id="intro-title">Code Assist online</h2>
            <p className="speech">{COPY.caOffer}</p>
            <div className="pr-actions">
              <button className="btn assist" onClick={() => onDecide('accept')} data-testid="accept-assist">
                Accept Code Assist — Show Me the Targets
              </button>
              <button className="btn ghost" onClick={() => onDecide('decline')} data-testid="decline-assist">
                Decline Assistance — I'll Execute the Work Manually
              </button>
            </div>
          </>
        )}

        {showOutcome && stage !== 'appear' && (
          <>
            <h2 id="intro-title">{mode === 'traditional' ? 'The Manual Challenge' : 'Briefing complete'}</h2>
            <p className="speech" data-testid="outcome-message">
              {outcome}
            </p>
            <button className="btn primary big" onClick={onBegin} data-testid="begin-mission">
              Take command
            </button>
            <p className="muted small">The timer starts when you take command.</p>
          </>
        )}
      </div>
    </div>
  );
}
