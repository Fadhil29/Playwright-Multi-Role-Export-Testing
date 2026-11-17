import { Download, expect, Locator, Page, test } from '@playwright/test';
import fs from 'fs';

type FileKind = 'pdf' | 'excel' | 'image';
type Kind = FileKind | 'any'; // 'any' = PDF or Excel, the detected format is recorded in the report

const startsWith = (bytes: number[]) => (buf: Buffer) => bytes.every((b, i) => buf[i] === b);

const MAGIC: { kind: FileKind; name: string; match: (buf: Buffer) => boolean }[] = [
  { kind: 'pdf', name: 'PDF', match: startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { kind: 'excel', name: 'XLSX', match: startsWith([0x50, 0x4b]) },
  { kind: 'excel', name: 'XLS', match: startsWith([0xd0, 0xcf, 0x11, 0xe0]) },
  { kind: 'image', name: 'PNG', match: startsWith([0x89, 0x50, 0x4e, 0x47]) },
  { kind: 'image', name: 'JPEG', match: startsWith([0xff, 0xd8, 0xff]) },
  { kind: 'image', name: 'SVG', match: (buf) => /^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 200).toString('utf8')) },
];

const EXT: Record<Kind, RegExp> = {
  pdf: /\.pdf$/i,
  excel: /\.xlsx?$/i,
  image: /\.(png|jpe?g|svg)$/i,
  any: /\.(pdf|xlsx?)$/i,
};

const PHP_ERROR = /(Fatal error|Parse error|Warning:|Deprecated:|Notice:|Uncaught )/;

async function validateDownload(download: Download, kind: Kind, label: string) {
  const failure = await download.failure();
  expect(failure, `${label}: download failed (${failure})`).toBeNull();

  const name = download.suggestedFilename();
  expect(name, `${label}: unexpected file extension "${name}"`).toMatch(EXT[kind]);

  const saved = test.info().outputPath(name);
  await download.saveAs(saved);

  const buf = fs.readFileSync(saved);
  expect(buf.length, `${label}: empty file (0 bytes)`).toBeGreaterThan(0);

  const detected = MAGIC.find((m) => m.match(buf));
  await test.info().attach(`${label} [${detected?.name ?? 'INVALID'}] - ${name}`, { path: saved });
  test.info().annotations.push({ type: 'format', description: `${label}: ${detected?.name ?? 'INVALID'} (${name})` });

  const okKind = kind === 'any' ? detected?.kind === 'pdf' || detected?.kind === 'excel' : detected?.kind === kind;
  expect(
    okKind,
    `${label}: content is not a valid ${kind} file, starts with: "${buf.subarray(0, 80).toString('utf8').replace(/\s+/g, ' ')}"`,
  ).toBe(true);
  return detected!.name;
}

// click export and assert a file is downloaded, non-empty, and really in the expected format (magic bytes).
// a PHP warning printed before the output still downloads, but fails here
export async function expectExport(page: Page, trigger: Locator, kind: Kind, label: string, timeout = 60000) {
  return test.step(`export ${kind}: ${label}`, async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout }).catch(() => null),
      trigger.click(),
    ]);
    expect(download, `${label}: no file downloaded after clicking export`).not.toBeNull();
    return validateDownload(download!, kind, label);
  });
}

// export that opens a new tab: a file downloaded from that tab is validated;
// a tab that only renders a page is recorded and checked for PHP errors
export async function expectPopupExport(page: Page, trigger: Locator, kind: Kind, label: string, timeout = 60000) {
  return test.step(`export ${kind} (new tab): ${label}`, async () => {
    let timer: NodeJS.Timeout | undefined;
    const download = new Promise<Download | null>((resolve) => {
      page.context().once('page', (p) => p.once('download', resolve)); // attach as early as possible
      timer = setTimeout(() => resolve(null), timeout);
    });
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout }).catch(() => null), trigger.click()]);
    expect(popup, `${label}: no new tab opened`).not.toBeNull();

    const file = await Promise.race([download, popup!.waitForEvent('close').then(() => null).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 15000))]);
    clearTimeout(timer);
    if (file) {
      const name = await validateDownload(file, kind, label);
      await popup!.close().catch(() => {});
      return name;
    }

    await popup!.waitForLoadState('domcontentloaded').catch(() => {});
    const url = popup!.url();
    const text = await popup!.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    await popup!.close().catch(() => {});
    test.info().annotations.push({ type: 'format', description: `${label}: NEW TAB without file (${url})` });
    const phpError = PHP_ERROR.test(text) ? text.slice(0, 300).replace(/\s+/g, ' ') : null;
    expect(phpError, `${label}: new tab (${url}) shows a PHP error: ${phpError}`).toBeNull();
    return 'TAB';
  });
}