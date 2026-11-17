import { expectExport } from '../helpers/export';
import { Page, test } from '../helpers/fixtures';
import { openFirstDetail, openMenu } from '../helpers/nav';

// export buttons are links on some pages and buttons on others
const exportBtn = (page: Page) =>
  page.getByRole('link', { name: /Export/ }).or(page.getByRole('button', { name: /Export/ })).filter({ visible: true }).first();
// fixed-column DataTables render hidden clones of each row button; only click the visible one
const firstView = (page: Page) => page.getByTitle('View').filter({ visible: true }).first();

const REPORTS = /^Reports/;
const INCIDENTS = /^\W*Incident Reports$/; // exact, so it never matches the group name

test.describe('Reports', () => {
  test('Incident Reports - export list', async ({ page }) => {
    await openMenu(page, REPORTS, INCIDENTS);
    await expectExport(page, exportBtn(page), 'any', 'Incident Reports');
  });

  test('Incident Reports - export detail', async ({ page }) => {
    await openMenu(page, REPORTS, INCIDENTS);
    await openFirstDetail(page, firstView(page));
    await expectExport(page, exportBtn(page), 'pdf', 'Incident Report Detail');
  });
});
