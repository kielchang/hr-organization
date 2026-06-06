import type { OrgData } from '../types/org';
import { ORG_SCHEMA_VERSION, migrateOrgData } from './migrations/orgMigrations';

export function cloneOrgData(data: OrgData): OrgData {
  return JSON.parse(JSON.stringify(data)) as OrgData;
}

export function prepareExport(data: OrgData): OrgData {
  return {
    ...cloneOrgData(data),
    schemaVersion: ORG_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
  };
}

/** Excel（Windows）需 BOM 才會以 UTF-8 開啟 CSV，避免中文亂碼 */
const UTF8_BOM = '\uFEFF';

export function withUtf8Bom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text : `${UTF8_BOM}${text}`;
}

export function downloadCsvText(content: string, filename: string): void {
  const blob = new Blob([withUtf8Bom(content)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadOrgData(data: OrgData, filename?: string): void {
  const payload = prepareExport(data);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .slice(0, 15);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `org-data-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseOrgDataRaw(raw: unknown): OrgData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('無效的組織資料格式');
  }
  const parsed = raw as Partial<OrgData>;
  if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.groups)) {
    throw new Error('缺少 employees 或 groups');
  }
  if (!Array.isArray(parsed.assignments)) {
    throw new Error('缺少 assignments');
  }
  // 通過最小結構驗證後，交由 migration 框架補欄位並升級到目前 schema。
  return migrateOrgData(raw);
}

export async function parseOrgDataFile(file: File): Promise<OrgData> {
  const text = await file.text();
  return parseOrgDataRaw(JSON.parse(text) as unknown);
}
