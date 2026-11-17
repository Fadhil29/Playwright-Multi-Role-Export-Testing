import 'dotenv/config';
import fs from 'fs';

// environment is chosen with TEST_ENV (default: staging); use the :prod npm scripts for production
const raw = (process.env.TEST_ENV ?? 'staging').trim().toLowerCase();
if (raw !== 'staging' && raw !== 'production') {
  throw new Error(`unknown TEST_ENV "${raw}" (use: staging, production)`);
}
export const TEST_ENV = raw as 'staging' | 'production';

const trim = (url = '') => url.trim().replace(/\/+$/, '');

export const STAGING_SSO_LAUNCHER_URL = process.env.STAGING_SSO_LAUNCHER_URL ?? '';
export const PROD_SSO_URL = trim(process.env.PROD_SSO_URL);
export const PROD_SSO_HOME_PATH = process.env.PROD_SSO_HOME_PATH ?? '/home';

// production app url is detected during npm run auth:prod and cached here (or set PROD_APP_URL)
export const PROD_APP_URL_FILE = 'playwright/.auth/production/app-url.txt';
const cachedProdUrl = () => (fs.existsSync(PROD_APP_URL_FILE) ? fs.readFileSync(PROD_APP_URL_FILE, 'utf8') : '');

export const APP_URL = trim(TEST_ENV === 'production' ? process.env.PROD_APP_URL || cachedProdUrl() : process.env.STAGING_APP_URL);
export const DASHBOARD_PATH = process.env.DASHBOARD_PATH ?? '/dashboard';
export const DASHBOARD_URL = `${APP_URL}${DASHBOARD_PATH}`;

const keys = TEST_ENV === 'production' ? ['PROD_USERNAME', 'PROD_PASSWORD'] : ['STAGING_USERNAME', 'STAGING_PASSWORD'];
export const CREDENTIALS = {
  userKey: keys[0],
  passKey: keys[1],
  username: process.env[keys[0]] ?? '',
  password: process.env[keys[1]] ?? '',
};
