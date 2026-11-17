import { Page } from '@playwright/test';
import { APP_URL, CREDENTIALS, DASHBOARD_PATH, PROD_SSO_HOME_PATH, PROD_SSO_URL, STAGING_SSO_LAUNCHER_URL } from './env';
import { debugShot, goto, isShown, pause, settle } from './browser';
import { activeRole, roleSwitcher } from './roles';

const DEBUG_DIR = 'playwright/.auth/debug';

// ---- selectors of the target app / SSO portal (adjust to your application) ----
const SSO = {
  username: { role: 'textbox' as const, name: 'Enter your username' },
  password: { role: 'textbox' as const, name: 'Enter your password' },
  submit: { role: 'button' as const, name: /sign in|log ?in|single sign/i },
  appSsoLink: /Single Sign On/i, // "login with SSO" button on the app login page
  proceed: /Proceed to/i, // confirmation shown by the SSO app launcher
  closeModal: /close|tutup/i,
  appTile: process.env.PROD_APP_TILE_SELECTOR ?? '[data-app-tile]', // app icon on the SSO home page
  reload: 'Reload', // portal popup shown on slow connections
};

// fill the SSO form and wait until we have really left the login page
export async function fillSsoForm(page: Page) {
  const user = page.getByRole(SSO.username.role, { name: SSO.username.name });
  await user.waitFor({ state: 'visible' });
  await user.fill(CREDENTIALS.username);
  await page.getByRole(SSO.password.role, { name: SSO.password.name }).fill(CREDENTIALS.password);
  await pause(page, 1000);
  await page.getByRole(SSO.submit.role, { name: SSO.submit.name }).first().click();

  await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 })
    .catch(() => {
      throw new Error(`sso login did not finish within 60s, still at ${page.url()}`);
    });
  await settle(page);
  await pause(page, 3000);
}

async function clickReloadIfShown(page: Page) {
  for (let i = 0; i < 5; i++) {
    const reload = page.getByRole('button', { name: SSO.reload });
    if (!(await isShown(reload, 5000))) return;
    await reload.click();
    await settle(page);
    await pause(page, 2000);
  }
}

// staging: app login -> SSO -> app launcher -> "Proceed to app"
export async function loginStaging(page: Page): Promise<Page> {
  await goto(page, `${APP_URL}/login`);
  await settle(page);
  await page.getByRole('link', { name: SSO.appSsoLink }).first().click();
  await settle(page);
  await fillSsoForm(page);

  await goto(page, STAGING_SSO_LAUNCHER_URL);
  await settle(page);
  const close = page.getByRole('button', { name: SSO.closeModal });
  if (await isShown(close, 5000)) await close.click();

  try {
    await page.getByText(SSO.proceed).first().click();
  } catch (err) {
    await debugShot(page, 'proceed-to-app', err, DEBUG_DIR);
  }
  await settle(page);
  await pause(page, 4000);
  return page;
}

// production: SSO portal -> app tile -> app embedded in an iframe (optionally another SSO click inside it).
// returns the app base url read from the iframe, so tests can open the app directly without the iframe
export async function openAppViaPortal(page: Page): Promise<string> {
  await goto(page, `${PROD_SSO_URL}/login`);
  await settle(page);
  try {
    // an existing portal session redirects away from the form
    if (await isShown(page.getByRole(SSO.username.role, { name: SSO.username.name }), 10000)) await fillSsoForm(page);
  } catch (err) {
    await debugShot(page, 'portal-login', err, DEBUG_DIR);
  }

  await goto(page, `${PROD_SSO_URL}${PROD_SSO_HOME_PATH}`);
  await settle(page);
  const tile = page.locator(SSO.appTile).first();
  if (!(await isShown(tile, 30000))) await debugShot(page, 'app-tile', new Error(`app tile ${SSO.appTile} not found`), DEBUG_DIR);
  await tile.click();
  await pause(page, 3000);

  // the reload popup can appear at any time and cover the sso button, so retry in rounds
  const frame = page.locator('iframe').first().contentFrame();
  const ssoInFrame = frame.getByRole('link', { name: SSO.appSsoLink });
  const roleInFrame = frame.locator('select:has(option[value^="/change_role/"])');
  for (let i = 0; i < 6; i++) {
    await clickReloadIfShown(page);
    if (await roleInFrame.isVisible().catch(() => false)) break;
    if (await isShown(ssoInFrame, 10000)) {
      if (await ssoInFrame.click({ timeout: 5000 }).then(() => true).catch(() => false)) await pause(page, 3000);
    }
    if (await isShown(roleInFrame, 10000)) break;
  }
  if (!(await isShown(roleInFrame, 60000))) await debugShot(page, 'app-in-iframe', new Error('app did not load in the portal iframe'), DEBUG_DIR);

  let frameUrl = '';
  for (const f of page.frames()) {
    if (f !== page.mainFrame() && (await roleSwitcher(f).isVisible().catch(() => false))) frameUrl = f.url();
  }
  const u = new URL(frameUrl);
  const cut = u.pathname.indexOf(DASHBOARD_PATH);
  return u.origin + (cut >= 0 ? u.pathname.slice(0, cut) : '');
}

// select a role from the sidebar dropdown; 'missing' when the account does not have it
export async function switchRole(app: Page, roleName: string, dashboardUrl: string): Promise<'ok' | 'missing'> {
  const switcher = roleSwitcher(app);
  const titles = await switcher.locator('option').evaluateAll((os) => os.map((o) => o.getAttribute('title') ?? ''));
  if (!titles.includes(roleName)) return 'missing';
  if ((await activeRole(app)) === roleName) return 'ok';

  const value = await switcher.locator(`option[title="${roleName}"]`).getAttribute('value');
  await Promise.all([app.waitForEvent('framenavigated', (f) => f === app.mainFrame()), switcher.selectOption(value!)]);
  await settle(app);
  await goto(app, dashboardUrl); // reload to prove the role is stored server-side
  await settle(app);

  const now = await activeRole(app);
  if (now !== roleName) throw new Error(`role switch failed: wanted "${roleName}", active "${now}"`);
  return 'ok';
}
