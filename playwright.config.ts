import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /(mobile|responsive)\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    // Breakpoint sweep: every screen at common phone/tablet sizes (Chromium emulation of each device's viewport, DPR and touch).
    ...(
      [
        ['phone-320-iphone-se', 'iPhone SE'],
        ['phone-390-iphone-14', 'iPhone 14'],
        ['phone-412-pixel-7', 'Pixel 7'],
        ['phone-landscape-iphone-14', 'iPhone 14 landscape'],
        ['tablet-768-ipad-mini', 'iPad Mini'],
        ['tablet-1024-ipad-mini-landscape', 'iPad Mini landscape'],
      ] as const
    ).map(([name, device]) => ({ name, use: { ...devices[device], browserName: 'chromium' as const }, testMatch: /responsive\.spec\.ts/ })),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: true,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/postgres',
          ALLOW_TEST_SEED: '1',
        },
      },
});
