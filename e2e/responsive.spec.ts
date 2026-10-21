/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { begin, enemyCell, enemyCells, fakeIp, fire, uniqueName } from './helpers';
import type { Mode } from '../src/engine/types';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

/**
 * Checks the current screen at this project's viewport: no sideways page scroll, no control cut off at the screen edge,
 * boards fully on screen, and (on touch devices) controls at least 24×24 px (WCAG 2.2 target size). Saves a screenshot.
 */
async function checkLayout(page: Page, info: TestInfo, label: string) {
  await page.waitForTimeout(100);
  const issues = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const sw = document.documentElement.scrollWidth;
    if (sw > vw + 1) out.push(`page scrolls sideways (${sw}px content in ${vw}px)`);
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const touch = matchMedia('(pointer: coarse)').matches;
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role=tab]')) {
      if (el.closest('.board')) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') continue;
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('data-testid') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 32);
      if (!clipped(el) && (b.left < -1 || b.right > vw + 1)) out.push(`cut off: "${name}" spans ${Math.round(b.left)}–${Math.round(b.right)}px`);
      if (touch && (b.width < 24 || b.height < 24)) out.push(`tap target too small: "${name}" ${Math.round(b.width)}×${Math.round(b.height)}px`);
    }
    for (const box of document.querySelectorAll<HTMLElement>('.panel, .board-panel, .table-wrap')) {
      if (box.clientWidth && box.scrollWidth > box.clientWidth + 1) {
        out.push(`content wider than its box: .${[...box.classList].join('.')} (${box.scrollWidth}px in ${box.clientWidth}px)`);
      }
    }
    for (const board of document.querySelectorAll<HTMLElement>('.board')) {
      const b = board.getBoundingClientRect();
      if (b.width && (b.left < -1 || b.right > vw + 1)) out.push(`board off screen: ${Math.round(b.left)}–${Math.round(b.right)}px`);
      const cell = board.querySelector<HTMLElement>('.cell')?.getBoundingClientRect();
      if (cell && cell.width && cell.width < 19) out.push(`board cells too small to tap: ${cell.width.toFixed(1)}px`);
    }
    return out;
  });
  await info.attach(label, { body: await page.screenshot({ fullPage: true, path: info.outputPath(`${label}.png`) }), contentType: 'image/png' });
  expect.soft(issues, `${label} @ ${info.project.name}`).toEqual([]);
}

async function placeAndStart(page: Page, info: TestInfo, mode: Mode, seed: number) {
  await page.goto(`/?testSeed=${seed}&fastAi=1`);
  await page.getByTestId(`play-${mode}`).click();
  await expect(page.getByTestId('randomise')).toBeVisible();
  await checkLayout(page, info, `placement-${mode}-empty`);
  await page.getByTestId('randomise').click();
  await checkLayout(page, info, `placement-${mode}-placed`);
  await page.getByTestId('start-battle').click();
  await expect(page.getByTestId('intro')).toBeVisible();
  await checkLayout(page, info, `intro-${mode}`);
}

test('every screen fits this device: no sideways scroll, nothing cut off, tappable controls', async ({ page }, info) => {
  const name = uniqueName('Rsp');
  await page.goto('/');
  await expect(page.getByTestId('name-input')).toBeVisible();
  await checkLayout(page, info, 'welcome');
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('name-continue').click();
  await expect(page.getByTestId('skip-avatar')).toBeVisible();
  await checkLayout(page, info, 'avatar-creator');
  await page.getByTestId('skip-avatar').click();
  await expect(page.getByTestId('recovery-code')).toBeVisible();
  await checkLayout(page, info, 'recovery-code');
  await page.getByTestId('profile-done').click();

  await expect(page.getByTestId('play-devin')).toBeVisible();
  await checkLayout(page, info, 'home');

  await page.getByTestId('profile-chip').click();
  await expect(page.getByTestId('profile-save')).toBeVisible();
  await checkLayout(page, info, 'profile');
  await page.getByTestId('recovery-new').click();
  await page.getByTestId('recovery-confirm').click();
  await expect(page.getByTestId('recovery-panel').getByTestId('recovery-code')).toBeVisible();
  await checkLayout(page, info, 'profile-new-recovery-code');

  for (const [mode, seed] of [['traditional', 31], ['codeassist', 32]] as const) {
    await placeAndStart(page, info, mode, seed);
    if (mode === 'codeassist') await page.getByTestId('accept-assist').click();
    await begin(page);
    await checkLayout(page, info, `battle-${mode}`);
    const tabs = page.getByRole('tab', { name: /Your fleet/ });
    if (await tabs.isVisible()) {
      await tabs.click();
      await checkLayout(page, info, `battle-${mode}-own-fleet`);
    }
    await page.getByTestId('restart').click();
    await expect(page.getByTestId('start-battle')).toBeVisible();
  }

  const seed = 33;
  await placeAndStart(page, info, 'devin', seed);
  await page.getByTestId('merge-pr').click();
  await begin(page);
  await checkLayout(page, info, 'battle-devin');
  for (const p of enemyCells('devin', seed)) {
    if (await page.getByTestId('result').isVisible()) break;
    if ((await enemyCell(page, p.r, p.c).getAttribute('data-state')) !== 'empty') continue;
    await fire(page, p.r, p.c);
  }
  await expect(page.getByTestId('result-title')).toContainText('Victory');
  await checkLayout(page, info, 'result-victory');

  await page.getByTestId('view-leaderboard').click();
  await expect(page.getByTestId('leaderboard').locator('tr', { hasText: name })).toBeVisible();
  await checkLayout(page, info, 'leaderboard');
});
