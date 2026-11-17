import { expect, Locator, Page, test } from '@playwright/test';
import { settle } from '../../scripts/browser';
import { DASHBOARD_URL } from '../../scripts/env';

export { settle };

const isVisible = (loc: Locator, timeout: number) =>
  loc.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);

// watch DataTables: the "Invalid JSON response" alert plus any ajax table response that is not JSON
// (on a PHP backend this is usually a warning/fatal error printed before the payload)
type DtState = { alerts: string[]; badResponses: string[] };
const DT = new WeakMap<Page, DtState>();

function watchDataTables(page: Page) {
  if (DT.has(page)) return;
  const state: DtState = { alerts: [], badResponses: [] };
  DT.set(page, state);

  page.on('dialog', async (d) => {
    if (d.message().includes('DataTables warning')) state.alerts.push(d.message());
    await d.dismiss().catch(() => {});
  });

  page.on('response', async (res) => {
    const req = res.request();
    if (!['xhr', 'fetch'].includes(req.resourceType())) return;
    if (!/[?&]draw=/.test(req.url()) && !/(^|&)draw=/.test(req.postData() ?? '')) return;
    const body = await res.text().catch(() => '');
    try {
      JSON.parse(body);
    } catch {
      state.badResponses.push(`HTTP ${res.status()} ${req.url()} -> ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
    }
  });
}

function dataTablesProblem(page: Page): string | null {
  const state = DT.get(page);
  if (!state || (!state.alerts.length && !state.badResponses.length)) return null;
  const kind = state.alerts.length ? 'Invalid JSON response' : 'non-JSON response';
  return `DataTables failed to load (${kind}): ${state.badResponses[0] ?? 'see the Network tab'}`;
}

// a menu missing from the sidebar is a skip for normal roles, but a failure for super-admin (has every menu)
async function requireMenu(link: Locator, label: string) {
  if (await isVisible(link, 10000)) return;
  const strict = test.info().project.name === 'super-admin';
  test.skip(!strict, `role has no menu "${label}"`);
  throw new Error(`menu "${label}" not found for super-admin`);
}

// open a nested sidebar menu, e.g. [/^Audit/, /^External Audit/, /Audit List/]
export async function openMenuPath(page: Page, path: RegExp[]) {
  watchDataTables(page);
  await page.goto(DASHBOARD_URL);
  await settle(page);

  for (const [i, name] of path.entries()) {
    const link = page.getByRole('link', { name }).first();
    await requireMenu(link, path.slice(0, i + 1).map((r) => r.source).join(' > '));
    await link.click();
    await page.waitForTimeout(1000);
  }
  await settle(page);
  await page.waitForTimeout(2000);

  // soft: recorded as a failure, but the test still tries the export
  const problem = dataTablesProblem(page);
  expect.soft(problem, problem ?? '').toBeNull();
}

export const openMenu = (page: Page, parent: RegExp, submenu: RegExp) => openMenuPath(page, [parent, submenu]);

// wait for a row action button. an empty table is a skip (nothing to export), not a bug
export async function waitForRowButton(page: Page, button: Locator) {
  const empty = page.locator('td.dataTables_empty').first();
  const state = await Promise.race([
    button.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'button'),
    empty.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'empty'),
  ]).catch(() => 'none');

  const problem = dataTablesProblem(page); // a broken ajax response must not pass as an empty table
  if (problem) throw new Error(problem);
  test.skip(state === 'empty', 'table is empty');
  if (state === 'none') throw new Error('row button not found and table is not empty');
  return button;
}

export async function openFirstDetail(page: Page, viewButton: Locator) {
  await waitForRowButton(page, viewButton);
  await viewButton.click();
  await settle(page);
  await page.waitForTimeout(2000);
}

// row button that opens a new tab; returns the new tab
export async function openRowPopup(page: Page, button: Locator) {
  await waitForRowButton(page, button);
  page.context().once('page', (p) => watchDataTables(p));
  const [popup] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  await settle(popup);
  await popup.waitForTimeout(2000);
  const problem = dataTablesProblem(popup);
  expect.soft(problem, problem ?? '').toBeNull();
  return popup;
}

// switch to another tab inside the same page
export async function openTab(page: Page, name: RegExp) {
  watchDataTables(page);
  await page.getByRole('link', { name }).filter({ visible: true }).first().click();
  await settle(page);
  await page.waitForTimeout(2000);
  const problem = dataTablesProblem(page);
  expect.soft(problem, problem ?? '').toBeNull();
}
