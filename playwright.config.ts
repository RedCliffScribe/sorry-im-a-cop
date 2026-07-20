import { defineConfig, devices } from '@playwright/test';

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '3001';
const playwrightBaseUrl = `http://127.0.0.1:${playwrightPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: playwrightBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${playwrightPort} --strictPort`,
    url: playwrightBaseUrl,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
