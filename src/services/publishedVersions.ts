import type { OrgData } from '../types/org';
import { cloneOrgData } from './exportImport';

const STORAGE_KEY = 'hr-org-published-versions';
/** 匯出/匯入發布版本整包時的識別標記 */
export const PUBLISHED_BUNDLE_KIND = 'hr-org-published-bundle';

export interface PublishedVersion {
  id: string;
  label: string;
  publishedAt: string;
  data: OrgData;
}

export interface PublishedVersionsBundle {
  kind: typeof PUBLISHED_BUNDLE_KIND;
  exportedAt: string;
  versions: PublishedVersion[];
}

function timestampLabel(date = new Date()): string {
  return date.toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'medium' });
}

function newId(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `pub-${rnd}`;
}

export function loadPublishedVersions(): PublishedVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is PublishedVersion =>
        !!v && typeof v.id === 'string' && !!v.data && typeof v.data === 'object',
    );
  } catch {
    return [];
  }
}

function persist(list: PublishedVersion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

/** 新增一筆發布版本（最新置頂），回傳更新後清單與新版本。 */
export function addPublishedVersion(
  data: OrgData,
  label?: string,
): { versions: PublishedVersion[]; created: PublishedVersion } {
  const created: PublishedVersion = {
    id: newId(),
    label: label?.trim() || timestampLabel(),
    publishedAt: new Date().toISOString(),
    data: cloneOrgData(data),
  };
  const next = [created, ...loadPublishedVersions()];
  persist(next);
  return { versions: next, created };
}

export function deletePublishedVersion(id: string): PublishedVersion[] {
  const next = loadPublishedVersions().filter((v) => v.id !== id);
  persist(next);
  return next;
}

export function buildPublishedBundle(): PublishedVersionsBundle {
  return {
    kind: PUBLISHED_BUNDLE_KIND,
    exportedAt: new Date().toISOString(),
    versions: loadPublishedVersions(),
  };
}

/**
 * 合併匯入的發布版本整包：依 id 去重（既有的保留），回傳合併後清單。
 * 來源若非本工具的發布整包格式則丟出錯誤。
 */
export function mergePublishedBundle(raw: unknown): PublishedVersion[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('檔案格式無法解析');
  }
  const bundle = raw as Partial<PublishedVersionsBundle>;
  if (bundle.kind !== PUBLISHED_BUNDLE_KIND || !Array.isArray(bundle.versions)) {
    throw new Error('這不是「發布版本」匯出檔');
  }
  const existing = loadPublishedVersions();
  const seen = new Set(existing.map((v) => v.id));
  const incoming = bundle.versions.filter(
    (v): v is PublishedVersion =>
      !!v && typeof v.id === 'string' && !seen.has(v.id) && !!v.data,
  );
  const merged = [...incoming, ...existing];
  persist(merged);
  return merged;
}
