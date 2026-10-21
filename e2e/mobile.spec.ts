/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { begin, createProfile, fakeIp, fire, startGame, uniqueName } from './helpers';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

test('mobile: 15x15 board fits the screen with usable cells and a board toggle', async ({ page }) => {
  await createProfile(page, uniqueName('Mob'));
  await startGame(page, 'traditional', 8);
  await begin(page);
  const vw = page.viewportSize()!.width;
  const board = page.getByTestId('enemy-board');
  const box = (await board.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw + 1);
  const cell = (await page.locator('[data-testid=enemy-board] .cell').first().boundingBox())!;
  expect(cell.width).toBeGreaterThanOrEqual(19);
  await expect(page.getByTestId('own-board')).toBeHidden();
  await fire(page, 7, 7);
  await page.getByRole('tab', { name: /Your fleet/ }).click();
  await expect(page.getByTestId('own-board')).toBeVisible();
  await expect(board).toBeHidden();
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(vw + 1);
});
