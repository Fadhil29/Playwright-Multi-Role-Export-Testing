import { DASHBOARD_URL } from '../../scripts/env';
import { expectExport } from '../helpers/export';
import { test } from '../helpers/fixtures';
import { settle } from '../helpers/nav';

test('Dashboard - export Excel', async ({ page }) => {
  await page.goto(DASHBOARD_URL);
  await settle(page);
  await page.getByRole('button', { name: 'View All' }).first().click();
  await settle(page);
  await expectExport(page, page.getByRole('link', { name: 'Export Excel' }), 'excel', 'Dashboard Excel');
});
