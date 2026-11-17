import { Locator, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const pause = (page: Page, ms = 2000) => page.waitForTimeout(ms);

// pages that keep polling never reach "networkidle", so cap the wait and rely on element checks after it
export const settle = (page: Page) => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

// do not wait for every chart/image on slow dashboards
export const goto = (page: Page, url: string) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

export const isShown = (loc: Locator, timeout: number) =>
  loc.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);

export async function debugShot(page: Page, step: string, err: unknown, dir: string): Promise<never> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `debug-${step}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`failed at step "${step}" (url: ${page.url()}, screenshot: ${file})`);
  throw err;
}
