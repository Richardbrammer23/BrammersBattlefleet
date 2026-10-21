import { expect, test } from '@playwright/test';
import { createProfile, fakeIp, uniqueName } from './helpers';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });

test('name input is capped at 15 characters and rejects disallowed names', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('name-input');
  await input.fill('ABCDEFGHIJKLMNOPQRST');
  await expect(input).toHaveValue('ABCDEFGHIJKLMNO');
  await input.fill('a');
  await expect(page.getByTestId('name-continue')).toBeDisabled();
});

test('profile with custom avatar persists across reloads and can be edited', async ({ page }) => {
  const name = uniqueName('Cap');
  await createProfile(page, name, { customiseAvatar: true });
  await page.reload();
  await expect(page.getByTestId('profile-chip')).toContainText(name);

  await page.getByTestId('profile-chip').click();
  const renamed = uniqueName('Adm');
  await page.getByTestId('profile-name').fill(renamed);
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-chip')).toContainText(renamed);
  await page.reload();
  await expect(page.getByTestId('profile-chip')).toContainText(renamed);
});

test('recovery code restores the profile in a fresh browser', async ({ page, browser }) => {
  const name = uniqueName('Rec');
  const code = await createProfile(page, name);
  const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const p2 = await other.newPage();
  await p2.goto('/');
  await p2.getByRole('button', { name: 'I have a recovery code' }).click();
  await p2.getByRole('textbox').fill(code.toLowerCase());
  await p2.getByRole('button', { name: /restore/i }).click();
  await expect(p2.getByTestId('profile-chip')).toContainText(name);
  await other.close();
});
