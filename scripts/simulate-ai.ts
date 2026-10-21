/* Measures how many shots each AI needs to sink a randomly placed fleet. Usage: npm run simulate [-- games] */
import { AI, aiView, fleetDestroyed, randomFleet, resolveShot, Rng, type GameState } from '../src/engine/index.js';

const games = Number(process.argv[2] ?? 2000);
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

for (const size of [10, 15]) {
  for (const d of ['easy', 'medium', 'hard'] as const) {
    const shots: number[] = [];
    for (let g = 0; g < games; g++) {
      const rng = new Rng(g * 7919 + size);
      const fleet = randomFleet(size, rng);
      const st = { size, playerFleet: fleet, aiShots: [] } as unknown as GameState;
      while (!fleetDestroyed(fleet, st.aiShots)) st.aiShots.push(resolveShot(fleet, st.aiShots, AI[d](aiView(st), rng)));
      shots.push(st.aiShots.length);
    }
    shots.sort((a, b) => a - b);
    const mean = shots.reduce((a, b) => a + b, 0) / shots.length;
    console.log(`${size}x${size} ${d.padEnd(6)} games=${games} mean=${mean.toFixed(1)} p10=${pct(shots, 10)} median=${pct(shots, 50)} p90=${pct(shots, 90)} min=${shots[0]} max=${shots.at(-1)}`);
  }
}
