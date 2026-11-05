import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. They expect the API (development mode, so the dev mailbox exists) and
 * the Angular dev server to be running; CI starts both (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    ...(process.env['PW_CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['PW_CHROMIUM_PATH'] } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
