import seedRaw from '../data/org-data.json';
import { cloneOrgData, parseOrgDataRaw } from './exportImport';
import { migrateOrgData } from './migrations/orgMigrations';
import { validateOrgData } from './validators';
import type { OrgData } from '../types/org';
import type { PublishedVersion } from './publishedVersions';
import type { ApiVersion } from './apiClient';

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
  contentVersion: number;
  exportedAt: string;
  isSeed: boolean;
  source: DataVersionSource;
  /** 生效日（YYYY-MM-DD），僅發布版本可能有；未設＝發布即生效。 */
  effectiveDate?: string;
  /** 這次調整的理由（選填），僅本機發布版本可能有；雲端版本無。 */
  note?: string;
}

const emptyOrgData: OrgData = {
  schemaVersion: 0,
  contentVersion: 0,
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
  return date
    ? `${prefix}（v${data.contentVersion} · ${date}）`
    : `${prefix}（v${data.contentVersion}）`;
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
      contentVersion: data.contentVersion,
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
      contentVersion: 0,
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
    contentVersion: data.contentVersion,
    exportedAt: pv.publishedAt,
    isSeed: false,
    source: 'published',
    effectiveDate: pv.effectiveDate,
    note: pv.note,
  };
}

/** 將後端 API 回傳的版本轉成下拉選單可用的 DataVersionInfo（標籤前綴「雲端」）。 */
export function apiVersionToInfo(v: ApiVersion): DataVersionInfo {
  const data = migrateOrgData(cloneOrgData(v.data));
  const errors = validateOrgData(data);
  return {
    id: v.id,
    filename: `${v.id}.json`,
    label: `雲端 · ${v.label}`,
    valid: errors.length === 0,
    errors,
    data,
    contentVersion: data.contentVersion,
    exportedAt: v.publishedAt,
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

/**
 * 從雲端版本清單挑出「最新」一筆的 id：依 `exportedAt`（＝後端 publishedAt）
 * 由新到舊；時間相同時以 id 由大到小作為穩定 tiebreak。空清單回 null。
 * 不就地排序（不可變），供 OrgProvider 自動預設選版與 QA 單元測試使用。
 */
export function pickLatestRemoteVersionId(
  remoteVersions: DataVersionInfo[],
): string | null {
  if (remoteVersions.length === 0) return null;
  let latest = remoteVersions[0];
  for (let i = 1; i < remoteVersions.length; i += 1) {
    const candidate = remoteVersions[i];
    if (isNewerVersion(candidate, latest)) latest = candidate;
  }
  return latest.id;
}

/** a 是否比 b 新：先比 exportedAt（字串 ISO 可直接比較），再以 id 由大到小 tiebreak。 */
function isNewerVersion(a: DataVersionInfo, b: DataVersionInfo): boolean {
  if (a.exportedAt !== b.exportedAt) return a.exportedAt > b.exportedAt;
  return a.id > b.id;
}
