import { chromium, devices, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { APP_URL, CREDENTIALS, DASHBOARD_PATH, DASHBOARD_URL, PROD_APP_URL_FILE, TEST_ENV } from './env';
import { goto, isShown, settle } from './browser';
import { loginStaging, openAppViaPortal, switchRole } from './login';
import { activeRole, authFile, ROLES, roleSwitcher } from './roles';

const only = process.argv[2]; // npm run auth -- auditor
const targets = only ? ROLES.filter((r) => r.slug === only) : ROLES;
if (only && !targets.length) throw new Error(`unknown role "${only}" (use: ${ROLES.map((r) => r.slug).join(', ')})`);
if (!CREDENTIALS.username || !CREDENTIALS.password) throw new Error(`${CREDENTIALS.userKey} / ${CREDENTIALS.passKey} missing in .env`);

const BROWSER = devices['Desktop Chrome']; // same fingerprint as the tests
let dashboardUrl = DASHBOARD_URL;

async function loginProduction(page: Page): Promise<Page> {
  const base = await openAppViaPortal(page);
  const app = await page.context().newPage();
  await goto(app, `${base}${DASHBOARD_PATH}`);
  if (!(await isShown(roleSwitcher(app), 30000))) throw new Error(`session not valid when opening ${base} directly`);
  if (base !== APP_URL) {
    fs.mkdirSync(path.dirname(PROD_APP_URL_FILE), { recursive: true });
    fs.writeFileSync(PROD_APP_URL_FILE, base);
  }
  dashboardUrl = `${base}${DASHBOARD_PATH}`;
  return app;
}

async function main() {
  fs.mkdirSync(path.dirname(authFile('x')), { recursive: true });
  console.log(`environment: ${TEST_ENV}`);
  const browser = await chromium.launch({ headless: !!process.env.CI, slowMo: process.env.CI ? 0 : 300 });

  // a fresh login per role gives every role its own server-side session; retry once on failure
  for (const role of targets) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const context = await browser.newContext({ ...BROWSER });
      try {
        const page = await context.newPage();
        const app = TEST_ENV === 'production' ? await loginProduction(page) : await loginStaging(page);
        if ((await switchRole(app, role.name, dashboardUrl)) === 'missing') {
          fs.rmSync(authFile(role.slug), { force: true });
          console.log(`SKIP ${role.name}: not available for this account in ${TEST_ENV}`);
          break;
        }
        await context.storageState({ path: authFile(role.slug) });
        console.log(`OK   ${role.name} -> ${authFile(role.slug)}`);
        break;
      } catch (err) {
        console.log(`attempt ${attempt} failed for ${role.name}: ${(err as Error).message.split('\n')[0]}`);
        if (attempt === 2) throw err;
      } finally {
        await context.close();
      }
    }
    await new Promise((r) => setTimeout(r, 3000)); // the SSO rejects rapid consecutive logins
  }

  // isolation check: every stored session must still report its own role
  const checks = [];
  for (const role of ROLES.filter((r) => fs.existsSync(authFile(r.slug)))) {
    const context = await browser.newContext({ ...BROWSER, storageState: authFile(role.slug) });
    const page = await context.newPage();
    const active = await goto(page, dashboardUrl)
      .then(() => settle(page))
      .then(() => activeRole(page))
      .catch((e) => `(check failed: ${(e as Error).message.split('\n')[0]})`);
    await context.close();
    checks.push({ role: role.name, active, ok: active === role.name });
  }
  console.table(checks);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
  await browser.close();
}

main();
