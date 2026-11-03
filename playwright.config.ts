import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4181', launchOptions: { executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm start', url: 'http://127.0.0.1:4181/api/health', reuseExistingServer: false,
    env: { HOST: '127.0.0.1', PORT: '4181', APP_URL: 'http://127.0.0.1:4181', DATABASE_PATH: `/tmp/subnest-e2e-${process.pid}.sqlite`, ADMIN_PASSWORD: 'e2e-test-password-not-for-production', DATA_ENCRYPTION_KEY: 'b'.repeat(64), PRODSELLER_MODE: 'demo', PAYMENT_MODE: 'demo', COOKIE_SECURE: 'false' },
  },
});
