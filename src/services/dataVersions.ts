import seedRaw from '../data/org-data.json';
import { cloneOrgData, parseOrgDataRaw } from './exportImport';
import { validateOrgData } from './validators';
import type { OrgData } from '../types/org';

export const SEED_DATA_PATH = 'src/data/org-data.json';
export const MOCK_DATA_DIR = 'src/data/mock';

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
}

const emptyOrgData: OrgData = {
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
    };
  }
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
