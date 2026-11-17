import { BrowserContext, devices, Page, test as base } from '@playwright/test';
import { goto, isShown, settle } from '../../scripts/browser';
import { DASHBOARD_URL, TEST_ENV } from '../../scripts/env';
import { openAppViaPortal, switchRole } from '../../scripts/login';
import { activeRole, authFile, ROLES, roleSwitcher } from '../../scripts/roles';

export * from '@playwright/test';

// production sessions may be rejected when reused in a new browser. before each test make sure the dashboard
// opens with the right role; otherwise re-enter through the SSO portal and select the role again
async function ensureApp(page: Page, roleName: string) {
  await goto(page, DASHBOARD_URL);
  await settle(page);
  if ((await isShown(roleSwitcher(page), 15000)) && (await activeRole(page)) === roleName) return;

  const helper = await page.context().newPage();
  try {
    await openAppViaPortal(helper);
  } finally {
    await helper.close();
  }
  await goto(page, DASHBOARD_URL);
  if (!(await isShown(roleSwitcher(page), 30000))) throw new Error(`app did not open at ${DASHBOARD_URL} (now at ${page.url()})`);
  if ((await switchRole(page, roleName, DASHBOARD_URL)) === 'missing') throw new Error(`account has no role "${roleName}"`);
}

export const test = base.extend<{}, { prodContext: BrowserContext | null }>({
  // production: one context per worker, shared by its tests so a recovered session is reused
  prodContext: [
    async ({ browser }, use, workerInfo) => {
      if (TEST_ENV !== 'production') return use(null);
      const ctx = await browser.newContext({ ...devices['Desktop Chrome'], storageState: authFile(workerInfo.project.name) });
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  context: async ({ context, prodContext }, use) => {
    await use(prodContext ?? context);
  },
  page: async ({ context, prodContext }, use, testInfo) => {
    const page = await context.newPage();
    const role = ROLES.find((r) => r.slug === testInfo.project.name);
    if (prodContext && role) await ensureApp(page, role.name);
    await use(page);
    await page.close();
  },
});
