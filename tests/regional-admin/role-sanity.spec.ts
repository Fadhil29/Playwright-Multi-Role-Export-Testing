import { DASHBOARD_URL } from '../../scripts/env';
import { roleSwitcher } from '../../scripts/roles';
import { expect, test } from '../helpers/fixtures';

test('active role is Regional Admin', async ({ page }) => {
  await page.goto(DASHBOARD_URL);
  await expect(roleSwitcher(page).locator('option:checked')).toHaveAttribute('title', 'Regional Admin');
});
