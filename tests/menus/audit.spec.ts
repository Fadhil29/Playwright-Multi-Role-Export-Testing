import { expectExport } from '../helpers/export';
import { Page, test } from '../helpers/fixtures';
import { openMenuPath, waitForRowButton } from '../helpers/nav';

const exportBtn = (page: Page) =>
  page.getByRole('link', { name: /Export/ }).or(page.getByRole('button', { name: /Export/ })).filter({ visible: true }).first();

const AUDIT_LIST = [/^Audit/, /^External Audit/, /Audit List/]; // three-level sidebar menu

test.describe('Audit', () => {
  test('Audit List - export list', async ({ page }) => {
    await openMenuPath(page, AUDIT_LIST);
    await expectExport(page, exportBtn(page), 'any', 'Audit List');
  });

  test('Audit List - download report per row', async ({ page }) => {
    await openMenuPath(page, AUDIT_LIST);
    const download = await waitForRowButton(page, page.getByTitle('Download PDF').filter({ visible: true }).first());
    await expectExport(page, download, 'pdf', 'Audit Report PDF');
  });
});
