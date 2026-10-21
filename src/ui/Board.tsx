import { useRef, useState, type KeyboardEvent } from 'react';
import { cellLabel, colLabel } from './format';

export type CellView = {
  state: 'empty' | 'ship' | 'miss' | 'hit' | 'sunk';
  highlighted?: boolean;
  preview?: 'valid' | 'invalid' | 'option' | 'anchor';
  blocked?: boolean;
  justHit?: boolean;
  revealed?: boolean;
  shipEdge?: string;
};

interface Props {
  size: number;
  label: string;
  cell: (r: number, c: number) => CellView;
  onFire?: (r: number, c: number) => void;
  onHover?: (r: number, c: number | null) => void;
  interactive: boolean;
  testId: string;
}

const describe = (v: CellView) =>
  v.state === 'sunk' ? 'sunk ship' : v.state === 'hit' ? 'hit' : v.state === 'miss' ? 'miss' : v.state === 'ship' ? 'your ship' : v.highlighted ? 'identified target' : 'unknown';

/** Accessible grid: every cell is a button, arrow keys move focus (roving tabindex), Enter/Space fires. */
export function Board({ size, label, cell, onFire, onHover, interactive, testId }: Props) {
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const move = (e: KeyboardEvent, r: number, c: number) => {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    const nr = Math.min(size - 1, Math.max(0, r + delta[0]));
    const nc = Math.min(size - 1, Math.max(0, c + delta[1]));
    setFocus({ r: nr, c: nc });
    onHover?.(nr, nc);
    ref.current?.querySelector<HTMLButtonElement>(`[data-r="${nr}"][data-c="${nc}"]`)?.focus();
  };

  return (
    <div className={`board size-${size}`} style={{ ['--n' as string]: size }} data-testid={testId}>
      <div className="board-axis corner" aria-hidden />
      {Array.from({ length: size }, (_, c) => (
        <div key={`h${c}`} className="board-axis" aria-hidden>
          {colLabel(c)}
        </div>
      ))}
      <div ref={ref} role="grid" aria-label={label} className="board-grid" onMouseLeave={() => onHover?.(-1, null)}>
        {Array.from({ length: size }, (_, r) => (
          <div role="row" key={r} className="board-row">
            <div className="board-axis row" aria-hidden>
              {r + 1}
            </div>
            {Array.from({ length: size }, (_, c) => {
              const v = cell(r, c);
              const fired = v.state === 'miss' || v.state === 'hit' || v.state === 'sunk';
              const cls = [
                'cell',
                v.state,
                v.highlighted ? 'target' : '',
                v.preview ? `preview-${v.preview}` : '',
                v.justHit ? 'just' : '',
                v.revealed ? 'revealed' : '',
                v.blocked ? 'blocked' : '',
                interactive && !fired ? 'clickable' : '',
              ].join(' ');
              return (
                <button
                  key={c}
                  role="gridcell"
                  type="button"
                  className={cls}
                  data-r={r}
                  data-c={c}
                  data-state={v.state}
                  data-target={v.highlighted ? '1' : undefined}
                  tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                  aria-label={`${label} ${cellLabel(r, c)}, ${describe(v)}`}
                  aria-disabled={!interactive || fired}
                  onClick={() => interactive && !fired && onFire?.(r, c)}
                  onMouseEnter={() => onHover?.(r, c)}
                  onFocus={() => setFocus({ r, c })}
                  onKeyDown={(e) => move(e, r, c)}
                >
                  {v.state === 'miss' && <span className="peg miss-peg" />}
                  {(v.state === 'hit' || v.state === 'sunk') && <span className="peg hit-peg" />}
                  {v.highlighted && !fired && <span className="crosshair" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
