import { expect, test } from '@playwright/test';
import { fakeIp } from './helpers';

// A browser that allows autoplay (e.g. a site the visitor often plays sound on, or autoplay enabled in settings).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() }, launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('music starts as soon as the site loads, with no tap, when the browser allows autoplay', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-sound', 'playing');
  await expect(page.locator('html')).toHaveAttribute('data-audio-context', 'running');
  await expect(page.getByTestId('sound-hint')).toBeHidden();
});
