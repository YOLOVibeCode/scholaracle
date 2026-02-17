import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Scholaracle E2E tests with fail-fast pyramid architecture.
 * 
 * ⚠️ PORT POLICY: Uses FIXED ports (2800-2804). DO NOT change these ports.
 * - 2800: Web App (FIXED)
 * - 2801: API Server (FIXED)
 * - 2802: MongoDB (FIXED)
 * - 2803: MailHog SMTP (FIXED)
 * - 2804: MailHog UI (FIXED)
 * 
 * Layer Structure:
 * - Layer 0 (@critical): 3 tests - Serial, stop on first failure
 * - Layer 1 (@auth): 8 tests - Depends on Layer 0
 * - Layer 2 (@dashboard): 37 tests - Depends on Layer 1
 * - Layer 3 (@navigation): ~40 tests - Depends on Layer 2
 * - Layer 4 (@feature): ~30 tests - Depends on Layer 3
 * - Layer 5 (@integration): 5 tests - Depends on Layer 4
 * - Layer 6 (@error): 6 tests - Depends on Layer 5
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  
  // Global setup: Seed database with live test data before all tests
  globalSetup: require.resolve('./global-setup.ts'),
  
  // Global timeout
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  
  // Fail fast for CI
  maxFailures: process.env.CI ? 5 : undefined,
  
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['json', { outputFile: 'results/results.json' }],
  ],
  
  use: {
    // Support production URLs via environment variable
    // Local: http://localhost:2800 (FIXED PORT)
    // Production: https://scholarmancy.com (or set BASE_URL)
    baseURL: process.env.BASE_URL ?? 'http://localhost:2800',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Chromium-only: always run the full layered suite.
  projects: [
    // Layer 0: Critical (runs first, serial, no retries)
    {
      name: 'critical',
      testMatch: /00-critical\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      retries: 0,
      timeout: 30 * 1000,
    },
    // Layer 1: Auth (depends on critical)
    {
      name: 'auth',
      testMatch: /01-auth\.spec\.ts|auth\/.*\.spec\.ts/,
      dependencies: ['critical'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 60 * 1000,
    },
    // Layer 2: Dashboard (depends on auth)
    {
      name: 'dashboard',
      testMatch: /02-dashboard.*\.spec\.ts/,
      dependencies: ['auth'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 60 * 1000,
    },
    // Layer 3: Navigation (depends on dashboard)
    {
      name: 'navigation',
      testMatch: /03-navigation.*\.spec\.ts/,
      dependencies: ['dashboard'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 60 * 1000,
    },
    // Layer 4: Feature (depends on navigation)
    {
      name: 'feature',
      testMatch: /04-feature.*\.spec\.ts/,
      dependencies: ['navigation'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 90 * 1000,
    },
    // Layer 5: Integration (depends on feature)
    {
      name: 'integration',
      testMatch: /05-integration\.spec\.ts/,
      dependencies: ['feature'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 120 * 1000,
    },
    // Layer 6: Error (depends on integration)
    {
      name: 'error',
      testMatch: /06-error\.spec\.ts/,
      dependencies: ['integration'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 60 * 1000,
    },
    // Layer 7: Onboarding Wizard (self-contained, exercises full UX flow)
    {
      name: 'onboarding',
      testMatch: /07-onboarding-wizard\.spec\.ts/,
      dependencies: ['critical'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 90 * 1000,
    },
    // Layer 8: Multi-Parent Sharing (self-contained, exercises sharing/admin flow)
    {
      name: 'multi-parent',
      testMatch: /08-multi-parent\.spec\.ts/,
      dependencies: ['critical'],
      use: { ...devices['Desktop Chrome'] },
      timeout: 90 * 1000,
    },
  ],

  // Web server configuration
  // Only start servers if BASE_URL is localhost (not production/staging)
  webServer: process.env.BASE_URL?.includes('localhost') || !process.env.BASE_URL ? [
    // API server (FIXED port 2801)
    {
      // Use in-memory MongoDB for fully self-contained E2E (no external Mongo daemon required).
      command: 'PORT=2801 MONGODB_URI=memory MONGODB_DB_NAME=scholaracle_test JWT_SECRET=test-secret NODE_ENV=test pnpm --filter @scholaracle/api dev',
      url: 'http://localhost:2801/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    // Web app (FIXED port 2800)
    {
      // Disable Next.js dev tools overlay which can intercept pointer events and cause Playwright flakiness.
      command: 'PORT=2800 AUTH_SECRET=e2e-test-secret NEXT_DISABLE_DEVTOOLS=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=http://localhost:2801/api pnpm --filter @scholaracle/web dev',
      url: 'http://localhost:2800',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ] : undefined,
  
  // Note: 
  // - Local: API server should be running separately on port 2801 (FIXED PORT)
  //   Start with: MONGODB_URI=mongodb://localhost:2802/scholaracle PORT=3002 pnpm --filter @scholaracle/api start
  //   Or use Docker: make test-up (starts Web on 2800, API on 2801, MongoDB on 2802)
  // - Production: Set API_BASE_URL environment variable to production API URL
  //   Example: API_BASE_URL=https://api.scholarmancy.com pnpm test
});


