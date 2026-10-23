import { expect, test, type Page } from '@playwright/test';
import { fakeIp } from './helpers';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

const status = (page: Page) => page.locator('html');

async function leave(page: Page, how: 'tab' | 'app') {
  await page.evaluate((h) => {
    if (h === 'tab') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    } else window.dispatchEvent(new Event('blur'));
  }, how);
}

async function comeBack(page: Page, how: 'tab' | 'app') {
  await page.evaluate((h) => {
    if (h === 'tab') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    window.dispatchEvent(new Event('focus'));
  }, how);
}

test('music waits for the first tap when the browser blocks autoplay, and pauses while the player is away', async ({ page }) => {
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-sound', 'blocked');
  await expect(page.getByTestId('sound-hint')).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(status(page)).toHaveAttribute('data-sound', 'playing');
  await expect(status(page)).toHaveAttribute('data-audio-context', 'running');
  await expect(page.getByTestId('sound-hint')).toBeHidden();

  for (const how of ['tab', 'app'] as const) {
    await leave(page, how);
    await expect(status(page)).toHaveAttribute('data-sound', 'paused');
    await expect(status(page)).toHaveAttribute('data-audio-context', 'suspended');
    await comeBack(page, how);
    await expect(status(page)).toHaveAttribute('data-sound', 'playing');
    await expect(status(page)).toHaveAttribute('data-audio-context', 'running');
  }
});

test('no sound hint for a player who has muted the game', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bbf.muted', '1'));
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-sound', 'muted');
  await expect(page.getByTestId('sound-hint')).toBeHidden();
});

test('typing a name counts as the first tap, even after a touch the browser did not accept for sound', async ({ page }) => {
  // On phones a touch's pointerdown does not unlock audio (its touchend does). Fire one before Playwright touches the page.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' })));
  });
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-sound', 'blocked');
  await expect(page.getByTestId('sound-hint')).toBeVisible();

  await page.getByLabel('Display name').focus();
  await page.keyboard.type('Rich');
  await expect(status(page)).toHaveAttribute('data-sound', 'playing');
  await expect(status(page)).toHaveAttribute('data-audio-context', 'running');
  await expect(page.getByTestId('sound-hint')).toBeHidden();
});
