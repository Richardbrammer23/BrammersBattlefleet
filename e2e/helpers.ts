import { expect, type Page } from '@playwright/test';
import { randomFleet, shipCells } from '../src/engine/fleet';
import { MODES } from '../src/engine/modes';
import { Rng } from '../src/engine/rng';
import type { Mode } from '../src/engine/types';

/** Each spec file gets its own synthetic client IP so per-IP rate limits don't leak between runs. */
export const fakeIp = () => `10.${rand()}.${rand()}.${rand()}`;
const rand = () => Math.floor(Math.random() * 254) + 1;

/** Re-derives the server's enemy fleet for a test seed using the shared engine (test-seed builds only). */
export function enemyCells(mode: Mode, seed: number) {
  return randomFleet(MODES[mode].boardSize, new Rng(seed)).flatMap(shipCells);
}

export const uniqueName = (prefix = 'E2E') => `${prefix}${Date.now().toString(36).slice(-6)}${rand().toString(36)}`;

export async function createProfile(page: Page, name: string, opts: { customiseAvatar?: boolean } = {}) {
  await page.goto('/');
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('name-continue').click();
  if (opts.customiseAvatar) {
    await page.getByRole('button', { name: /^mohawk$/i }).click();
    await page.getByTestId('save-avatar').click();
  } else {
    await page.getByTestId('skip-avatar').click();
  }
  const code = (await page.getByTestId('recovery-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  await page.getByTestId('profile-done').click();
  await expect(page.getByTestId('profile-chip')).toContainText(name);
  return code;
}

export async function startGame(page: Page, mode: Mode, seed: number, fastAi = true) {
  await page.goto(`/?testSeed=${seed}${fastAi ? '&fastAi=1' : ''}`);
  await page.getByTestId(`play-${mode}`).click();
  await page.getByTestId('randomise').click();
  await page.getByTestId('start-battle').click();
  await expect(page.getByTestId('battle')).toBeVisible();
  await expect(page.getByTestId('intro')).toBeVisible();
}

export const enemyCell = (page: Page, r: number, c: number) => page.locator(`[data-testid=enemy-board] [data-r="${r}"][data-c="${c}"]`);

export async function fire(page: Page, r: number, c: number) {
  const cell = enemyCell(page, r, c);
  await cell.click();
  // A winning shot can switch straight to the result screen (reduced motion), removing the board.
  await expect(async () => {
    if (await page.getByTestId('result').isVisible()) return;
    expect(await cell.getAttribute('data-state', { timeout: 500 })).toMatch(/miss|hit|sunk/);
  }).toPass();
  await expect(page.getByTestId('turn-indicator').or(page.getByTestId('result'))).toContainText(/Your turn|Victory|Defeat/);
}

export async function begin(page: Page) {
  await page.getByTestId('begin-mission').click();
  await expect(page.getByTestId('intro')).toBeHidden();
  await expect(page.getByTestId('turn-indicator')).toContainText('Your turn');
}
