import { expectExport, expectPopupExport } from '../helpers/export';
import { expect, Locator, Page, test } from '../helpers/fixtures';
import { openMenu } from '../helpers/nav';

const PERFORMANCE = /^Performance/;
const INDICATORS = /^\W*Indicators$/;

// every chart has PDF / Image / Excel Data buttons. check all charts and report the failing ones together
async function eachChart(page: Page, linkName: string, run: (link: Locator, label: string) => Promise<unknown>) {
  const links = page.getByRole('link', { name: linkName, exact: true }).filter({ visible: true });
  await links.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const count = await links.count();
  expect(count, `no "${linkName}" buttons on the page`).toBeGreaterThan(0);

  const failures: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      await run(links.nth(i), `chart #${i + 1} ${linkName}`);
    } catch (e) {
      failures.push(`chart #${i + 1}: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  expect(failures, `${failures.length}/${count} charts failed: ${failures.join(' | ')}`).toHaveLength(0);
}

test.describe('Performance', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test('Indicators - PDF for every chart', async ({ page }) => {
    await openMenu(page, PERFORMANCE, INDICATORS);
    await eachChart(page, 'PDF', (link, label) => expectExport(page, link, 'pdf', label));
  });

  test('Indicators - image for every chart', async ({ page }) => {
    await openMenu(page, PERFORMANCE, INDICATORS);
    await eachChart(page, 'Image', (link, label) => expectExport(page, link, 'image', label));
  });

  test('Indicators - Excel data (opens a new tab)', async ({ page }) => {
    await openMenu(page, PERFORMANCE, INDICATORS);
    await eachChart(page, 'Excel Data', (link, label) => expectPopupExport(page, link, 'excel', label));
  });
});
