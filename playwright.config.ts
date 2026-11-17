import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import { APP_URL, TEST_ENV } from './scripts/env';
import { authFile, ROLES } from './scripts/roles';

if (!APP_URL) throw new Error('app url unknown: set STAGING_APP_URL, or run "npm run auth:prod" for production');

// roles without a stored session (e.g. not granted to the account in this environment) are left out
const activeRoles = ROLES.filter((r) => TEST_ENV !== 'production' || fs.existsSync(authFile(r.slug)));

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  workers: TEST_ENV === 'production' ? 2 : undefined, // be gentle with production
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/excel-reporter.ts']],
  expect: { timeout: TEST_ENV === 'production' ? 30000 : 5000 },
  use: {
    baseURL: `${APP_URL}/`,
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 60000,
  },
  // one project per role; specs in tests/menus run for every role, tests/<role> only for that role
  projects: activeRoles.map((r) => ({
    name: r.slug,
    testMatch: [`**/tests/${r.slug}/**/*.spec.ts`, '**/tests/menus/**/*.spec.ts'],
    use: { ...devices['Desktop Chrome'], storageState: authFile(r.slug) },
  })),
});
