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
    baseURL: process.env.BASE_URL ?? 'http://localhost:2800',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

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
      testMatch: /01-auth\.spec\.ts/,
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
    
    // Layer 5: Integration (depends on feature, serial)
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
    
    // Cross-browser (optional, runs after feature layer)
    {
      name: 'firefox',
      testMatch: /0[1-4]-.*\.spec\.ts/,
      dependencies: ['feature'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: /0[1-4]-.*\.spec\.ts/,
      dependencies: ['feature'],
      use: { ...devices['Desktop Safari'] },
    },
    
    // Mobile (optional)
    {
      name: 'mobile',
      testMatch: /03-navigation.*\.spec\.ts/,
      dependencies: ['dashboard'],
      use: { ...devices['iPhone 14'] },
    },
  ],

  // Web server configuration
  webServer: {
    command: 'pnpm --filter @scholaracle/web dev',
    url: 'http://localhost:2800',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  
  // Note: API server should be running separately on port 2801 (external)
  // Start with: MONGODB_URI=mongodb://localhost:2802/scholaracle PORT=3002 pnpm --filter @scholaracle/api start
  // Or use Docker: make test-up (starts Web on 2800, API on 2801, MongoDB on 2802)
});


