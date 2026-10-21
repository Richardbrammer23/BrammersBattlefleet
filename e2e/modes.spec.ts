import { expect, test } from '@playwright/test';
import { begin, createProfile, enemyCell, enemyCells, fakeIp, fire, startGame, uniqueName } from './helpers';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

test('Devin: merging the PR lands 9 autonomous hits with 0 human turns, then the player wins and is ranked', async ({ page }) => {
  const name = uniqueName('Dev');
  await createProfile(page, name);
  const seed = 4242;
  await startGame(page, 'devin', seed);
  await expect(page.getByTestId('pr-card')).toContainText('PR #001');
  await page.getByTestId('merge-pr').click();
  await expect(page.getByTestId('outcome-message')).toContainText('Zero human turns used');
  await expect(page.locator('[data-testid=enemy-board] .cell.hit, [data-testid=enemy-board] .cell.sunk')).toHaveCount(9);
  await expect(page.getByTestId('turns')).toHaveText('0');
  await begin(page);

  for (const p of enemyCells('devin', seed)) {
    if ((await enemyCell(page, p.r, p.c).getAttribute('data-state')) !== 'empty') continue;
    await fire(page, p.r, p.c);
  }
  await expect(page.getByTestId('result-title')).toContainText('Victory');
  await expect(page.getByTestId('result-turns')).toHaveText('8');
  await expect(page.getByTestId('result-rank')).toContainText('#');

  await page.getByTestId('view-leaderboard').click();
  const lb = page.getByTestId('leaderboard');
  await lb.getByRole('tab', { name: 'Devin' }).click();
  const row = lb.locator('tr', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row.locator('svg.avatar')).toBeVisible();
  await expect(row).toContainText('8');
  await lb.getByRole('tab', { name: 'Traditional Coding' }).click();
  await expect(lb.locator('tr', { hasText: name })).toHaveCount(0);
});

test('Devin: declining the PR highlights all 9 targets and every shot counts', async ({ page }) => {
  await createProfile(page, uniqueName('Dcl'));
  await startGame(page, 'devin', 777);
  await page.getByTestId('decline-pr').click();
  await expect(page.getByTestId('outcome-message')).toContainText('declined');
  await begin(page);
  const targets = page.locator('[data-testid=enemy-board] [data-target="1"]');
  await expect(targets).toHaveCount(9);
  await expect(page.locator('[data-testid=enemy-board] .cell.hit')).toHaveCount(0);
  const t = targets.first();
  await fire(page, Number(await t.getAttribute('data-r')), Number(await t.getAttribute('data-c')));
  await expect(page.getByTestId('turns')).toHaveText('1');
});

test('Code Assist: accepting highlights 3 targets without firing', async ({ page }) => {
  await createProfile(page, uniqueName('Acc'));
  await startGame(page, 'codeassist', 99);
  await page.getByTestId('accept-assist').click();
  await expect(page.getByTestId('outcome-message')).toContainText('3 identified targets');
  await begin(page);
  await expect(page.locator('[data-testid=enemy-board] [data-target="1"]')).toHaveCount(3);
  await expect(page.locator('[data-testid=enemy-board] .cell.hit')).toHaveCount(0);
  await expect(page.getByTestId('turns')).toHaveText('0');
});

test('Code Assist: declining highlights only 1 of the 3 targets', async ({ page }) => {
  await createProfile(page, uniqueName('CaD'));
  await startGame(page, 'codeassist', 99);
  await page.getByTestId('decline-assist').click();
  await expect(page.getByTestId('outcome-message')).toContainText('1 of the 3');
  await begin(page);
  await expect(page.locator('[data-testid=enemy-board] [data-target="1"]')).toHaveCount(1);
});

test('Traditional: 15x15 board, no assistance, duplicate shots ignored, keyboard firing works', async ({ page }) => {
  await createProfile(page, uniqueName('Trd'));
  await startGame(page, 'traditional', 31337);
  await expect(page.getByTestId('outcome-message')).toContainText('no suggested targets');
  await begin(page);
  await expect(page.locator('[data-testid=enemy-board] .cell')).toHaveCount(225);
  await expect(page.locator('[data-testid=enemy-board] [data-target="1"]')).toHaveCount(0);

  await fire(page, 0, 0);
  await expect(page.getByTestId('turns')).toHaveText('1');
  await expect(enemyCell(page, 0, 0)).toHaveAttribute('aria-disabled', 'true');
  await enemyCell(page, 0, 0).click({ force: true });
  await page.waitForTimeout(300);
  await expect(page.getByTestId('turns')).toHaveText('1');

  await enemyCell(page, 0, 0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(enemyCell(page, 0, 1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(enemyCell(page, 0, 1)).toHaveAttribute('data-state', /miss|hit|sunk/);
  await expect(page.getByTestId('turns')).toHaveText('2');

  // Timer runs while playing.
  const t1 = await page.getByTestId('timer').textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId('timer').textContent()).not.toBe(t1);
});

test('Traditional: a player who only misses is defeated and is not ranked', async ({ page }) => {
  test.setTimeout(240_000);
  await createProfile(page, uniqueName('Los'));
  const seed = 2024;
  await startGame(page, 'traditional', seed);
  await begin(page);
  const ships = new Set(enemyCells('traditional', seed).map((p) => `${p.r},${p.c}`));
  outer: for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      if (ships.has(`${r},${c}`)) continue;
      await fire(page, r, c);
      if (/Defeat/.test((await page.getByTestId('turn-indicator').textContent()) ?? '')) break outer;
    }
  await expect(page.getByTestId('result-title')).toContainText('Defeat');
  await expect(page.getByTestId('result-rank')).toHaveCount(0);
});

test('an in-progress game resumes after reload; restart abandons it', async ({ page }) => {
  await createProfile(page, uniqueName('Res'));
  await startGame(page, 'codeassist', 5);
  await page.getByTestId('accept-assist').click();
  await begin(page);
  await fire(page, 9, 9);
  await page.reload();
  await expect(page.getByTestId('battle')).toBeVisible();
  await expect(page.getByTestId('turns')).toHaveText('1');
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('start-battle')).toBeVisible();
});
