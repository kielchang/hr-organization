import type { OrgData } from '../../types/org';
import { backfillAssignmentLevels } from '../assignmentLevels';
import { runMigrations, type Migration } from './runMigrations';

/** OrgData 目前的 schema 版本。新增結構性變更時 +1 並補一個 migration step。 */
export const ORG_SCHEMA_VERSION = 1;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * v0 → v1：把「無 schemaVersion 的舊匯出檔／草稿」正規化為 v1。
 * - 補齊 jobLevels / changeLog 等可選陣列
 * - 補上 schemaVersion，保留既有 version（內容版本）與 exportedAt
 * - 以組內匯報深度回填缺漏的 assignment.level
 */
const toV1: Migration = {
  to: 1,
  migrate: (raw) => {
    const r = asRecord(raw);
    const data: OrgData = {
      schemaVersion: 1,
      version: typeof r.version === 'number' ? r.version : 1,
      exportedAt:
        typeof r.exportedAt === 'string' ? r.exportedAt : new Date().toISOString(),
      employees: asArray(r.employees),
      groups: asArray(r.groups),
      jobLevels: asArray(r.jobLevels),
      assignments: asArray(r.assignments),
      changeLog: asArray(r.changeLog),
    };
    return backfillAssignmentLevels(data);
  },
};

export const orgMigrations: Migration[] = [toV1];

/** 將任意版本的組織資料升級到目前 schema 版本。 */
export function migrateOrgData(raw: unknown): OrgData {
  return runMigrations<OrgData>(raw, ORG_SCHEMA_VERSION, orgMigrations);
}
