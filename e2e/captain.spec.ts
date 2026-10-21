import { expect, test } from '@playwright/test';
import { begin, createProfile, enemyCell, fakeIp, startGame, uniqueName } from './helpers';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

const placementCell = (page: import('@playwright/test').Page, r: number, c: number) =>
  page.locator(`[data-testid=placement-board] [data-r="${r}"][data-c="${c}"]`);

test('two-click placement: the second square sets the direction and the ship fills in', async ({ page }) => {
  await createProfile(page, uniqueName('Plc'));
  await page.goto('/?fastAi=1');
  await page.getByTestId('play-codeassist').click();
  const board = page.getByTestId('placement-board');

  // Carrier: anchor A1 shows only the two directions that fit (right and down).
  await placementCell(page, 0, 0).click();
  await expect(board.locator('.cell.preview-anchor')).toHaveCount(1);
  await expect(board.locator('.cell.preview-option')).toHaveCount(8);
  await expect(page.getByTestId('placement-status')).toContainText('Carrier starts at A1');
  // A diagonal second click is rejected and keeps the anchor.
  await placementCell(page, 1, 1).click();
  await expect(page.getByTestId('placement-status')).toContainText('same row or column as A1');
  await expect(placementCell(page, 0, 0)).toHaveClass(/preview-anchor/);
  await expect(board.locator('[data-state=ship]')).toHaveCount(0);
  await placementCell(page, 0, 1).click();
  for (let c = 0; c < 5; c++) await expect(placementCell(page, 0, c)).toHaveAttribute('data-state', 'ship');

  // Battleship pointing down, chosen by a non-adjacent square in the same column.
  await placementCell(page, 2, 3).click();
  await placementCell(page, 8, 3).click();
  for (let r = 2; r < 6; r++) await expect(placementCell(page, r, 3)).toHaveAttribute('data-state', 'ship');

  // Cruiser pointing left and Submarine pointing up.
  await placementCell(page, 9, 9).click();
  await placementCell(page, 9, 8).click();
  for (let c = 7; c < 10; c++) await expect(placementCell(page, 9, c)).toHaveAttribute('data-state', 'ship');
  await placementCell(page, 6, 0).click();
  await placementCell(page, 5, 0).click();
  for (let r = 4; r < 7; r++) await expect(placementCell(page, r, 0)).toHaveAttribute('data-state', 'ship');

  // Destroyer: clicking the anchor again cancels; then place it right.
  await placementCell(page, 7, 5).click();
  await placementCell(page, 7, 5).click();
  await expect(board.locator('.cell.preview-anchor')).toHaveCount(0);
  await placementCell(page, 7, 5).click();
  await placementCell(page, 7, 6).click();
  await expect(page.getByTestId('placement-status')).toContainText('Fleet ready');
  await expect(board.locator('[data-state=ship]')).toHaveCount(17);

  await page.getByTestId('start-battle').click();
  await expect(page.getByTestId('intro')).toBeVisible();
});

test('Captain Brammer takes about 2 seconds per turn and his miss is announced', async ({ page }) => {
  await createProfile(page, uniqueName('Cap'));
  await startGame(page, 'traditional', 4242, false);
  await begin(page);
  const t0 = Date.now();
  await enemyCell(page, 14, 14).click();
  await expect(page.getByTestId('turn-indicator')).toContainText('Captain Brammer is targeting');
  await expect(page.locator('.toast').filter({ hasText: /Captain Brammer (missed|hit|sank)/ })).toBeVisible({ timeout: 6000 });
  expect(Date.now() - t0).toBeGreaterThanOrEqual(1900);
  await expect(page.getByTestId('turn-indicator')).toContainText('Your turn');
});

test('the full leaderboard offers Play again for the last mode played', async ({ page }) => {
  await createProfile(page, uniqueName('Lbp'));
  await page.goto('/');
  await page.getByTestId('play-traditional').click();
  await expect(page.locator('[data-testid=placement-board] [data-r]')).toHaveCount(225);
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).first().click();
  const again = page.getByTestId('leaderboard-play-again');
  await expect(again).toContainText('Play again');
  await again.click();
  await expect(page.locator('[data-testid=placement-board] [data-r]')).toHaveCount(225);
});
