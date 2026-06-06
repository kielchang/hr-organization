import seedRaw from '../data/org-data.json';
import { cloneOrgData, parseOrgDataRaw } from './exportImport';
import { migrateOrgData } from './migrations/orgMigrations';
import { validateOrgData } from './validators';
import type { OrgData } from '../types/org';
import type { PublishedVersion } from './publishedVersions';

export const SEED_DATA_PATH = 'src/data/org-data.json';
export const MOCK_DATA_DIR = 'src/data/mock';

/** 版本來源：seed=內建初始檔、mock=內建範例檔、published=本機發布版本 */
export type DataVersionSource = 'seed' | 'mock' | 'published';

export interface DataVersionInfo {
  id: string;
  filename: string;
  label: string;
  valid: boolean;
  errors: string[];
  data: OrgData;
  version: number;
  exportedAt: string;
  isSeed: boolean;
  source: DataVersionSource;
}

const emptyOrgData: OrgData = {
  schemaVersion: 0,
  version: 0,
  exportedAt: '',
  employees: [],
  groups: [],
  jobLevels: [],
  assignments: [],
  changeLog: [],
};

const mockModules = import.meta.glob('../data/mock/*.json', {
  eager: true,
}) as Record<string, { default: OrgData }>;

function filenameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? path;
}

function buildLabel(
  filename: string,
  data: OrgData,
  isSeed: boolean,
): string {
  const base = filename.replace(/\.json$/i, '');
  const prefix = isSeed ? '初始' : base;
  const date = data.exportedAt
    ? new Date(data.exportedAt).toLocaleString('zh-TW', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';
  return date ? `${prefix}（v${data.version} · ${date}）` : `${prefix}（v${data.version}）`;
}

function parseVersionEntry(
  raw: unknown,
  id: string,
  filename: string,
  isSeed: boolean,
): DataVersionInfo {
  const source: DataVersionSource = isSeed ? 'seed' : 'mock';
  try {
    const data = cloneOrgData(parseOrgDataRaw(raw));
    const errors = validateOrgData(data);
    return {
      id,
      filename,
      label: buildLabel(filename, data, isSeed),
      valid: errors.length === 0,
      errors,
      data,
      version: data.version,
      exportedAt: data.exportedAt,
      isSeed,
      source,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '無法解析檔案';
    return {
      id,
      filename,
      label: `${filename}（格式錯誤）`,
      valid: false,
      errors: [message],
      data: emptyOrgData,
      version: 0,
      exportedAt: '',
      isSeed,
      source,
    };
  }
}

/** 將本機發布版本轉成下拉選單可用的 DataVersionInfo（標籤前綴「發布」）。 */
export function publishedVersionToInfo(pv: PublishedVersion): DataVersionInfo {
  // 舊發布版本可能缺 schemaVersion，轉成下拉資訊時一併升級。
  const data = migrateOrgData(cloneOrgData(pv.data));
  const errors = validateOrgData(data);
  return {
    id: pv.id,
    filename: `${pv.id}.json`,
    label: `發布 · ${pv.label}`,
    valid: errors.length === 0,
    errors,
    data,
    version: data.version,
    exportedAt: pv.publishedAt,
    isSeed: false,
    source: 'published',
  };
}

export function loadDataVersions(): DataVersionInfo[] {
  const seed = parseVersionEntry(seedRaw, 'org-data', 'org-data.json', true);
  const local: DataVersionInfo[] = [];

  for (const [path, mod] of Object.entries(mockModules)) {
    const filename = filenameFromPath(path);
    const id = filename.replace(/\.json$/i, '');
    local.push(parseVersionEntry(mod.default, id, filename, false));
  }

  local.sort((a, b) => a.filename.localeCompare(b.filename, 'zh-Hant'));
  return [seed, ...local];
}

export function pickDefaultVersionId(versions: DataVersionInfo[]): string {
  const preferred = versions.find((v) => v.id === 'org-data' && v.valid);
  if (preferred) return preferred.id;
  const valid = versions.find((v) => v.valid);
  if (valid) return valid.id;
  if (versions.length > 0) return versions[0].id;
  return '';
}
