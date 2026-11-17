import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { ROLES } from '../scripts/roles';
import { TEST_ENV } from '../scripts/env';

type Row = {
  role: string;
  menu: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  note: string;
  format: string;
  seconds: number;
};

const STATUS_FILL: Record<Row['status'], string> = { PASS: 'FFC6EFCE', FAIL: 'FFFFC7CE', SKIP: 'FFFFEB9C' };
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

// writes every run to excel: a Summary sheet (scenario x role matrix) and a Details sheet
export default class ExcelReporter implements Reporter {
  private results = new Map<string, Row>();

  onTestEnd(test: TestCase, result: TestResult) {
    const role = test.parent.project()?.name ?? '-';
    const [, , file, ...titles] = test.titlePath();
    const annotations = [...test.annotations, ...((result as any).annotations ?? [])];

    const status: Row['status'] =
      result.status === 'passed' ? 'PASS' : result.status === 'skipped' ? 'SKIP' : 'FAIL';
    const note =
      status === 'SKIP'
        ? annotations.find((a) => a.type === 'skip' || a.type === 'fixme')?.description ?? 'skipped'
        : status === 'FAIL'
            ? [...new Set(result.errors.map((e) => stripAnsi(e.message ?? '').split('\n')[0]))].join(' | ').slice(0, 500) || result.status
          : '';
    const format = [...new Set(annotations.filter((a) => a.type === 'format').map((a) => a.description ?? ''))].join('; ');

    // with retries, keep the last attempt only
    this.results.set(test.id, {
      role,
      menu: path.basename(file ?? '').replace(/\.spec\.ts$/, ''),
      test: titles.join(' › '),
      status,
      note,
      format,
      seconds: Math.round(result.duration / 100) / 10,
    });
  }

  async onEnd(_: FullResult) {
    const rows = [...this.results.values()];
    if (rows.length === 0) return;

    const roleOrder = ROLES.map((r) => r.slug as string).filter((s) => rows.some((r) => r.role === s));
    const roleLabel = (slug: string) => ROLES.find((r) => r.slug === slug)?.name ?? slug;

    const wb = new ExcelJS.Workbook();
    const font = { name: 'Arial', size: 10 };
    const header = (ws: ExcelJS.Worksheet) => {
      ws.getRow(1).eachCell((c) => {
        c.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    // sheet 1: summary matrix
    const sum = wb.addWorksheet('Summary');
    sum.columns = [
      { header: 'Menu', key: 'menu', width: 18 },
      { header: 'Test', key: 'test', width: 48 },
      ...roleOrder.map((s) => ({ header: roleLabel(s), key: s, width: 16 })),
    ];
    const keys = [...new Map(rows.map((r) => [`${r.menu}|${r.test}`, r])).values()]
      .sort((a, b) => a.menu.localeCompare(b.menu));
    for (const k of keys) {
      const line: Record<string, string> = { menu: k.menu, test: k.test };
      for (const s of roleOrder) {
        line[s] = rows.find((r) => r.role === s && r.menu === k.menu && r.test === k.test)?.status ?? '-';
      }
      sum.addRow(line);
    }
    const last = sum.rowCount;
    for (const label of ['PASS', 'FAIL', 'SKIP'] as const) {
      const r = sum.addRow({ test: `Total ${label}` });
      roleOrder.forEach((_, i) => {
        const col = sum.getColumn(i + 3).letter;
        r.getCell(i + 3).value = { formula: `COUNTIF(${col}2:${col}${last},"${label}")` };
      });
      r.font = { ...font, bold: true };
    }
    header(sum);

    // sheet 2: details
    const det = wb.addWorksheet('Details');
    det.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Role', key: 'role', width: 24 },
      { header: 'Menu', key: 'menu', width: 18 },
      { header: 'Test', key: 'test', width: 48 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Note', key: 'note', width: 60 },
      { header: 'File Format', key: 'format', width: 40 },
      { header: 'Duration (s)', key: 'seconds', width: 14 },
    ];
    rows
      .sort((a, b) => a.menu.localeCompare(b.menu) || roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
      .forEach((r, i) => det.addRow({ ...r, no: i + 1, role: roleLabel(r.role) }));
    header(det);

    for (const ws of [sum, det]) {
      ws.eachRow((row, n) => {
        if (n === 1) return;
        row.eachCell((c) => {
          c.font = { ...font, bold: (c.font as any)?.bold };
          c.alignment = { vertical: 'top', wrapText: true };
          const v = String(c.value ?? '');
          if (v in STATUS_FILL) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[v as Row['status']] } };
            c.alignment = { vertical: 'top', horizontal: 'center' };
          }
        });
      });
    }

    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`; // local time
    fs.mkdirSync('excel-report', { recursive: true });
    const out = path.join('excel-report', `export-report-${TEST_ENV}-${stamp}.xlsx`);
    await wb.xlsx.writeFile(out);
    console.log(`\nExcel report: ${out}`);
  }
}