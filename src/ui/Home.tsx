import { MODES, type Mode } from '../engine';
import { ModeCharacter } from './Characters';
import { Leaderboard } from './Leaderboard';

const CARD_COPY: Record<Mode, { tagline: string; description: string; advantage: string; difficulty: string }> = {
  devin: {
    tagline: 'Easy',
    description: 'Devin autonomously identifies 9 enemy ship cells and opens a pull request with the completed attacks. Merge it and the work is done — zero human turns.',
    advantage: '9 of 17 cells executed autonomously (52.9%)',
    difficulty: 'Easy — random targeting',
  },
  codeassist: {
    tagline: 'Medium',
    description: 'Code Assist points out 3 enemy ship cells, but you still have to fire every shot yourself.',
    advantage: '3 of 17 cells identified (17.6%) — you execute',
    difficulty: 'Medium — hunt & target',
  },
  traditional: {
    tagline: 'Hard',
    description: 'No assistant, no suggested targets, and a larger ocean. Every shot is on you.',
    advantage: 'None',
    difficulty: 'Hard — probability targeting',
  },
};

export function ModeCards({ onPlay }: { onPlay: (m: Mode) => void }) {
  return (
    <div className="mode-cards">
      {(Object.keys(MODES) as Mode[]).map((m) => {
        const cfg = MODES[m];
        const copy = CARD_COPY[m];
        return (
          <article key={m} className={`mode-card ${m}`} data-testid={`mode-${m}`}>
            <div className="mode-card-top">
              <ModeCharacter mode={m} size={84} />
              <span className={`difficulty-badge ${m}`}>{copy.tagline}</span>
            </div>
            <h3>{cfg.title}</h3>
            <p className="muted">{copy.description}</p>
            <dl className="mode-stats">
              <div>
                <dt>Board</dt>
                <dd>
                  {cfg.boardSize}×{cfg.boardSize}
                </dd>
              </div>
              <div>
                <dt>Assistance</dt>
                <dd>{copy.advantage}</dd>
              </div>
              <div>
                <dt>Captain Brammer</dt>
                <dd>{copy.difficulty}</dd>
              </div>
            </dl>
            <button className={`btn primary mode-btn ${m}`} onClick={() => onPlay(m)} data-testid={`play-${m}`}>
              Deploy fleet
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function Home({ onPlay, onViewLeaderboard }: { onPlay: (m: Mode) => void; onViewLeaderboard: () => void }) {
  return (
    <main className="home">
      <section className="hero">
        <div className="radar" aria-hidden>
          <div className="sweep" />
        </div>
        <p className="eyebrow">Naval command centre</p>
        <h1>
          Brammers <span className="accent">BattleFleet</span> AI
        </h1>
        <p className="lead">
          Classic Battleship against Captain Brammer, an AI admiral, played three ways. <strong>Devin</strong> does the work autonomously. <strong>Code Assist</strong> helps you do it.
          With <strong>Traditional Coding</strong>, you find and do all of it yourself. The leaderboard shows which one wins.
        </p>
        <div className="hero-actions">
          <a className="btn primary big" href="#modes" data-testid="play-now">
            Play Now
          </a>
          <button className="btn ghost big" onClick={onViewLeaderboard}>
            View leaderboard
          </button>
        </div>
      </section>

      <section id="modes" className="modes-section" aria-labelledby="modes-title">
        <div className="section-head">
          <h2 id="modes-title">Choose your mode</h2>
          <p className="muted">Every mode uses the classic 17-cell fleet. Fewest human turns wins.</p>
        </div>
        <div className="modes-layout">
          <ModeCards onPlay={onPlay} />
          <Leaderboard compact onViewAll={onViewLeaderboard} title="Top 10" />
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="how-steps">
          <li>
            <span className="step-n">1</span>
            <h3>Deploy your fleet</h3>
            <p className="muted">Place your Carrier, Battleship, Cruiser, Submarine and Destroyer on the grid, or click Randomise.</p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>Choose your help</h3>
            <p className="muted">Devin offers a pull request with attacks already done. Code Assist shows you targets. Traditional Coding gives you nothing.</p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>Take turns firing</h3>
            <p className="muted">One shot per turn, alternating with Captain Brammer. Only your own shots count as human turns. The timer runs until the last enemy ship sinks.</p>
          </li>
          <li>
            <span className="step-n">4</span>
            <h3>Climb the leaderboard</h3>
            <p className="muted">The server checks every win. Rankings go by fewest human turns, then fastest time.</p>
          </li>
        </ol>
        <p className="muted small disclaimer">
          The percentages are game mechanics, not measured productivity benchmarks.
        </p>
      </section>
    </main>
  );
}
