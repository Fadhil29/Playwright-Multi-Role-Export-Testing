import type { Frame, Page } from '@playwright/test';
import { TEST_ENV } from './env';

// one account holds every role; the active role is switched from a dropdown in the app sidebar
export const ROLES = [
  { name: 'Viewer', slug: 'viewer' },
  { name: 'Unit Admin', slug: 'unit-admin' },
  { name: 'Regional Admin', slug: 'regional-admin' },
  { name: 'Head Office Admin', slug: 'head-office-admin' },
  { name: 'Auditor', slug: 'auditor' },
  { name: 'Super Admin', slug: 'super-admin' },
] as const;

// sessions are stored per environment so staging and production never overwrite each other
export const authFile = (slug: string) =>
  TEST_ENV === 'production' ? `playwright/.auth/production/${slug}.json` : `playwright/.auth/${slug}.json`;

// <select> whose options navigate to /change_role/<id>
export const roleSwitcher = (page: Page | Frame) => page.locator('select:has(option[value^="/change_role/"])');

export const activeRole = async (page: Page | Frame) =>
  (await roleSwitcher(page).locator('option:checked').getAttribute('title')) ?? '';
