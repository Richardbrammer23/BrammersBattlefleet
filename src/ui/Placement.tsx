import { useCallback, useEffect, useMemo, useState } from 'react';
import { MODES, placementError, randomFleet, Rng, shipCells, shipOptions, shipTowards, SHIPS, type Coord, type Fleet, type Mode, type ShipId } from '../engine';
import { cellLabel } from './format';
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
  const [anchor, setAnchor] = useState<Coord | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hover, setHover] = useState<Coord | null>(null);

  const nextUnplaced = useCallback((f: Fleet) => SHIPS.find((s) => !f.some((x) => x.id === s.id))?.id ?? null, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAnchor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const occupied = useMemo(() => {
    const m = new Map<string, ShipId>();
    for (const s of fleet) for (const p of shipCells(s)) m.set(`${p.r},${p.c}`, s.id);
    return m;
  }, [fleet]);

  // Squares that could start the selected ship (at least one direction fits).
  const anchorable = useMemo(() => {
    const ok = new Set<string>();
    if (!selected) return ok;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (shipOptions(fleet, selected, { r, c }, size).length) ok.add(`${r},${c}`);
    return ok;
  }, [fleet, selected, size]);

  const options = useMemo(() => (selected && anchor ? shipOptions(fleet, selected, anchor, size) : []), [fleet, selected, anchor, size]);
  const optionCells = useMemo(() => new Set(options.flatMap(shipCells).map((p) => `${p.r},${p.c}`)), [options]);

  const preview = useMemo(() => {
    if (!selected || !hover) return null;
    if (!anchor) return { cells: [hover], valid: anchorable.has(`${hover.r},${hover.c}`) };
    const ship = shipTowards(selected, anchor, hover);
    if (!ship) return null;
    return { cells: shipCells(ship), valid: !placementError(fleet, ship, size) };
  }, [selected, hover, anchor, anchorable, fleet, size]);

  const cell = (r: number, c: number): CellView => {
    const k = `${r},${c}`;
    const inPreview = preview?.cells.some((p) => p.r === r && p.c === c);
    const isAnchor = anchor?.r === r && anchor?.c === c;
    return {
      state: occupied.has(k) ? 'ship' : 'empty',
      preview: isAnchor ? 'anchor' : inPreview ? (preview!.valid ? 'valid' : 'invalid') : optionCells.has(k) ? 'option' : undefined,
      blocked: !!selected && !anchor && !occupied.has(k) && !anchorable.has(k),
    };
  };

  const place = (r: number, c: number) => {
    const k = `${r},${c}`;
    setHint(null);
    const at = occupied.get(k);
    if (at && !anchor) {
      // Pick a placed ship back up.
      setFleet(fleet.filter((s) => s.id !== at));
      setSelected(at);
      return;
    }
    if (!selected) return;
    if (!anchor) {
      if (anchorable.has(k)) setAnchor({ r, c });
      return;
    }
    if (anchor.r === r && anchor.c === c) return setAnchor(null);
    const ship = shipTowards(selected, anchor, { r, c });
    if (ship && !placementError(fleet, ship, size)) {
      const next = [...fleet.filter((s) => s.id !== selected), ship];
      setFleet(next);
      setSelected(nextUnplaced(next));
      setAnchor(null);
    } else {
      // Keep the anchor and explain, rather than silently moving the start square.
      const from = cellLabel(anchor.r, anchor.c);
      setHint(ship ? `It doesn't fit that way from ${from}. Try another direction.` : `Pick a square in the same row or column as ${from}.`);
    }
  };

  const randomise = () => {
    const f = randomFleet(size, new Rng((Math.random() * 2 ** 32) >>> 0));
    setFleet(f);
    setSelected(null);
    setAnchor(null);
  };

  const spec = SHIPS.find((s) => s.id === selected);
  const status = !spec
    ? fleet.length === SHIPS.length
      ? 'Fleet ready. Click a ship to move it, or begin the battle.'
      : 'Select a ship, or click a placed ship to move it.'
    : anchor
      ? hint ?? `${spec.name} starts at ${cellLabel(anchor.r, anchor.c)}. Click a square next to it to point the ship that way.`
      : `Click the first square for your ${spec.name} (${spec.length} squares).`;

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
          <p className="muted small">Pick a ship, click its first square, then click the next square in the direction it should point. The rest fills in automatically.</p>
          <p className="placement-status small" aria-live="polite" data-testid="placement-status">
            {status}
          </p>
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
                      setAnchor(null);
                    }}
                    aria-pressed={selected === s.id}
                    data-testid={`ship-${s.id}`}
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
            <button className="btn ghost" onClick={randomise} data-testid="randomise">
              Randomise
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setFleet([]);
                setSelected('carrier');
                setAnchor(null);
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
