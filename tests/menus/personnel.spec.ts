import { expectExport } from '../helpers/export';
import { Page, test } from '../helpers/fixtures';
import { openMenu, openRowPopup, openTab } from '../helpers/nav';

const exportBtn = (page: Page) =>
  page.getByRole('link', { name: /Export/ }).or(page.getByRole('button', { name: /Export/ })).filter({ visible: true }).first();

// the "History" row action opens the personnel profile in a new tab with several sub-tabs
async function openProfile(page: Page) {
  await openMenu(page, /^Personnel/, /^\W*Staff$/);
  return openRowPopup(page, page.getByTitle('History').filter({ visible: true }).first());
}

test.describe('Personnel', () => {
  test('Profile - export position history', async ({ page }) => {
    const profile = await openProfile(page);
    await expectExport(profile, exportBtn(profile), 'any', 'Position History');
  });

  test('Profile - export training', async ({ page }) => {
    const profile = await openProfile(page);
    await openTab(profile, /^\W*Training$/);
    await expectExport(profile, exportBtn(profile), 'any', 'Training');
  });
});
