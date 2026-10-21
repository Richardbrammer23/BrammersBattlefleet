import { expect, test } from '@playwright/test';
import { begin, createProfile, enemyCell, enemyCells, fakeIp, fire, startGame, uniqueName } from './helpers';

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

test('duplicate names are rejected, ignoring case and spaces, with a route to sign in', async ({ page, browser }) => {
  const name = uniqueName('Dup');
  await createProfile(page, name);
  const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const p2 = await other.newPage();
  await p2.goto('/');
  await p2.getByTestId('name-input').fill(`  ${name.toUpperCase()} `);
  await p2.getByTestId('name-continue').click();
  await expect(p2.getByTestId('name-taken')).toContainText(
    "This captain's name is already registered. Please choose another username or sign in to your existing profile.",
  );
  await expect(p2.getByTestId('name-continue')).toBeDisabled();
  await p2.getByTestId('sign-in-existing').click();
  await expect(p2.getByText('Sign in to your existing profile with the recovery code')).toBeVisible();
  await other.close();
});

test('a returning player is recognised after refresh and after closing and reopening the browser', async ({ page, browser }) => {
  const name = uniqueName('Ret');
  await createProfile(page, name);
  const id = (await (await page.request.get('/api/players/me')).json()).player.id;
  expect(await page.evaluate(() => [document.cookie.includes('bbf_session'), localStorage.getItem('bbf.token')])).toEqual([false, null]);
  const cookie = (await page.context().cookies()).find((c) => c.name === 'bbf_session');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' });
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);

  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByTestId('profile-chip')).toContainText(name);
  }
  const state = await page.context().storageState();
  await page.context().close();

  const reopened = await browser.newContext({ storageState: state, extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const p2 = await reopened.newPage();
  await p2.goto('/');
  await expect(p2.getByTestId('profile-chip')).toContainText(name);
  await expect(p2.getByTestId('name-input')).toHaveCount(0);
  expect((await (await p2.request.get('/api/players/me')).json()).player.id).toBe(id);
  await reopened.close();
});

test('a profile saved by an older build in localStorage is moved into the secure cookie', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const name = uniqueName('Old');
  const res = await api.post('/api/players', { data: { displayName: name, avatar: null } });
  const token = /bbf_session=([^;]+)/.exec(res.headers()['set-cookie'] ?? '')![1];
  await api.dispose();
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('bbf.token', t);
      sessionStorage.setItem('seeded', '1');
    }
  }, token);
  await page.goto('/');
  await expect(page.getByTestId('profile-chip')).toContainText(name);
  expect(await page.evaluate(() => localStorage.getItem('bbf.token'))).toBeNull();
  await page.reload();
  await expect(page.getByTestId('profile-chip')).toContainText(name);
});

test('a new avatar and name show everywhere, including historical leaderboard entries', async ({ page }) => {
  const name = uniqueName('Av');
  await createProfile(page, name);
  const seed = 4242;
  await startGame(page, 'devin', seed);
  await page.getByTestId('merge-pr').click();
  await begin(page);
  for (const p of enemyCells('devin', seed)) {
    if ((await enemyCell(page, p.r, p.c).getAttribute('data-state')) !== 'empty') continue;
    await fire(page, p.r, p.c);
  }
  await expect(page.getByTestId('result-title')).toContainText('Victory');
  await page.getByTestId('view-leaderboard').click();
  const lb = page.getByTestId('leaderboard');
  const before = await lb.locator('tr', { hasText: name }).locator('svg.avatar').innerHTML();

  await page.goto('/');
  await page.getByTestId('profile-chip').click();
  const renamed = uniqueName('Nw');
  await page.getByTestId('profile-name').fill(renamed);
  await page.getByRole('button', { name: /^mohawk$/i }).click();
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  const chipAvatar = await page.getByTestId('profile-chip').locator('svg.avatar').innerHTML();

  await page.reload();
  await expect(page.getByTestId('profile-chip')).toContainText(renamed);
  expect(await page.getByTestId('profile-chip').locator('svg.avatar').innerHTML()).toBe(chipAvatar);
  await page.goto('/');
  await page.getByRole('button', { name: 'View leaderboard' }).click();
  const row = page.getByTestId('leaderboard').locator('tr', { hasText: renamed });
  await expect(row).toHaveCount(1);
  const after = await row.locator('svg.avatar').innerHTML();
  expect(after).not.toBe(before);
  expect(after).toBe(chipAvatar);
  await expect(page.getByTestId('leaderboard').locator('tr', { hasText: name })).toHaveCount(0);
});

test('the profile issues a new recovery code that restores the profile, and the old code stops working', async ({ page, browser }) => {
  const name = uniqueName('Key');
  const oldCode = await createProfile(page, name);
  await page.getByTestId('profile-chip').click();
  await page.getByTestId('recovery-new').click();
  await expect(page.getByTestId('recovery-confirm')).toBeVisible();
  await page.getByTestId('recovery-confirm').click();
  const panel = page.getByTestId('recovery-panel');
  await expect(panel).toContainText('Your previous code no longer works');
  const newCode = ((await panel.getByTestId('recovery-code').textContent()) ?? '').trim();
  expect(newCode).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(newCode).not.toBe(oldCode);
  await page.reload();
  await expect(page.getByTestId('profile-chip')).toContainText(name);

  const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const p2 = await other.newPage();
  await p2.goto('/');
  await p2.getByRole('button', { name: 'I have a recovery code' }).click();
  await p2.getByRole('textbox').fill(oldCode);
  await p2.getByRole('button', { name: /restore/i }).click();
  await expect(p2.getByText('That recovery code was not recognised.')).toBeVisible();
  await p2.getByRole('textbox').fill(newCode);
  await p2.getByRole('button', { name: /restore/i }).click();
  await expect(p2.getByTestId('profile-chip')).toContainText(name);
  await other.close();
});
