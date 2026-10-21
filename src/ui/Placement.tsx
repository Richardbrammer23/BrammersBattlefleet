import { useCallback, useEffect, useMemo, useState } from 'react';
import { MODES, placementError, randomFleet, Rng, shipCells, SHIPS, type Fleet, type Mode, type Orientation, type ShipId } from '../engine';
import { Board, type CellView } from './Board';
import { ModeCharacter } from './Characters';

interface Props {
  mode: Mode;
  busy: boolean;
  error: string | null;
  onStart: (fleet: Fleet) => void;
  onBack: () => void;
}

export function Placement({ mode, busy, error, onStart, onBack }: Props) {
  const size = MODES[mode].boardSize;
  const [fleet, setFleet] = useState<Fleet>([]);
  const [selected, setSelected] = useState<ShipId | null>('carrier');
  const [orientation, setOrientation] = useState<Orientation>('H');
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const nextUnplaced = useCallback((f: Fleet) => SHIPS.find((s) => !f.some((x) => x.id === s.id))?.id ?? null, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement)) setOrientation((o) => (o === 'H' ? 'V' : 'H'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const preview = useMemo(() => {
    if (!selected || !hover) return null;
    const ship = { id: selected, r: hover.r, c: hover.c, orientation };
    return { cells: shipCells(ship), valid: !placementError(fleet, ship, size) };
  }, [selected, hover, orientation, fleet, size]);

  const occupied = useMemo(() => {
    const m = new Map<string, ShipId>();
    for (const s of fleet) for (const p of shipCells(s)) m.set(`${p.r},${p.c}`, s.id);
    return m;
  }, [fleet]);

  const cell = (r: number, c: number): CellView => {
    const inPreview = preview?.cells.some((p) => p.r === r && p.c === c);
    return {
      state: occupied.has(`${r},${c}`) ? 'ship' : 'empty',
      preview: inPreview ? (preview!.valid ? 'valid' : 'invalid') : undefined,
    };
  };

  const place = (r: number, c: number) => {
    const at = occupied.get(`${r},${c}`);
    if (!selected && at) {
      // Pick a placed ship back up.
      const ship = fleet.find((s) => s.id === at)!;
      setFleet(fleet.filter((s) => s.id !== at));
      setSelected(at);
      setOrientation(ship.orientation);
      return;
    }
    if (!selected) return;
    const ship = { id: selected, r, c, orientation };
    if (placementError(fleet, ship, size)) return;
    const next = [...fleet.filter((s) => s.id !== selected), ship];
    setFleet(next);
    setSelected(nextUnplaced(next));
  };

  const randomise = () => {
    const f = randomFleet(size, new Rng((Math.random() * 2 ** 32) >>> 0));
    setFleet(f);
    setSelected(null);
  };

  const complete = fleet.length === SHIPS.length;

  return (
    <main className="page placement">
      <div className="page-head">
        <button className="btn ghost" onClick={onBack} disabled={busy}>
          ← Modes
        </button>
        <div className="placement-title">
          <ModeCharacter mode={mode} size={44} />
          <div>
            <p className="eyebrow">{MODES[mode].title}</p>
            <h1>Deploy your fleet</h1>
          </div>
        </div>
      </div>
      <div className="placement-layout">
        <div className="panel board-panel">
          <Board
            size={size}
            label="Your waters"
            testId="placement-board"
            interactive
            cell={cell}
            onFire={place}
            onHover={(r, c) => setHover(c == null ? null : { r, c })}
          />
        </div>
        <aside className="panel dock">
          <h2>Shipyard</h2>
          <p className="muted small">Select a ship, then click the grid. Click a placed ship to move it. Press R to rotate.</p>
          <ul className="ship-list">
            {SHIPS.map((s) => {
              const placed = fleet.some((f) => f.id === s.id);
              return (
                <li key={s.id}>
                  <button
                    className={`ship-btn ${selected === s.id ? 'active' : ''} ${placed ? 'placed' : ''}`}
                    onClick={() => {
                      setFleet(fleet.filter((f) => f.id !== s.id));
                      setSelected(s.id);
                    }}
                    aria-pressed={selected === s.id}
                  >
                    <span>{s.name}</span>
                    <span className="ship-pips" aria-label={`length ${s.length}`}>
                      {Array.from({ length: s.length }, (_, i) => (
                        <i key={i} />
                      ))}
                    </span>
                    <span className="small muted">{placed ? 'Placed ✓' : selected === s.id ? 'Placing…' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="dock-actions">
            <button className="btn ghost" onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}>
              Rotate ({orientation === 'H' ? 'Horizontal' : 'Vertical'})
            </button>
            <button className="btn ghost" onClick={randomise} data-testid="randomise">
              Randomise
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setFleet([]);
                setSelected('carrier');
              }}
            >
              Clear
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn primary big block" disabled={!complete || busy} onClick={() => onStart(fleet)} data-testid="start-battle">
            {busy ? 'Preparing battle…' : complete ? 'Begin battle' : `Place all ships (${fleet.length}/5)`}
          </button>
        </aside>
      </div>
    </main>
  );
}
