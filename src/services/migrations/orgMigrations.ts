import type { Assignment, Group, OrgData } from '../../types/org';
import { backfillAssignmentLevels } from '../assignmentLevels';
import { deriveInGroupRoot } from '../groupLeadership';
import { runMigrations, type Migration } from './runMigrations';

/** OrgData 目前的 schema 版本。新增結構性變更時 +1 並補一個 migration step。 */
export const ORG_SCHEMA_VERSION = 4;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * v0 → v1：把「無 schemaVersion 的舊匯出檔／草稿」正規化為 v1。
 * - 補齊 jobLevels / changeLog 等可選陣列
 * - 補上 schemaVersion，保留內容版本（相容舊欄位名 `version`）與 exportedAt
 * - 以組內匯報深度回填缺漏的 assignment.level
 */
const toV1: Migration = {
  to: 1,
  migrate: (raw) => {
    const r = asRecord(raw);
    // 內容版本：優先讀新欄位 contentVersion，相容舊匯出檔的 version。
    const legacyVersion = typeof r.version === 'number' ? r.version : 1;
    const data: OrgData = {
      schemaVersion: 1,
      contentVersion:
        typeof r.contentVersion === 'number' ? r.contentVersion : legacyVersion,
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

/**
 * v1 → v2：為 `Group` 補上 `kind` 判別子。
 * - 缺 `kind` 的舊資料一律視為 'department'（階層部門）；專案職能由使用者在 App 內後設標記。
 */
const toV2: Migration = {
  to: 2,
  migrate: (raw) => {
    const data = raw as OrgData;
    const groups: Group[] = asArray<Group>(data.groups).map((g) => ({
      ...g,
      kind: g.kind ?? 'department',
    }));
    return { ...data, schemaVersion: 2, groups };
  },
};

/**
 * v2 → v3：清除所有 `assignment.level`（設為 `undefined`）。
 * - 層級語意翻轉：預設改由「主匯報深度」自動計算，`level` 退為稀疏的「手動覆寫」。
 * - 現存的 level 是佈局產物／職等殘值（含 v1 backfill 的回填值），**非使用者刻意覆寫**
 *   → 一律清除後改走計算深度＝乾淨；之後使用者垂直拖曳才會產生真正的稀疏覆寫。
 */
const toV3: Migration = {
  to: 3,
  migrate: (raw) => {
    const data = raw as OrgData;
    const assignments: Assignment[] = asArray<Assignment>(data.assignments).map(
      (a) => ({ ...a, level: undefined }),
    );
    return { ...data, schemaVersion: 3, assignments };
  },
};

/**
 * 為每個 group 回填 `leaderId`。
 *
 * - `leaderId` 已有值（含 null 以外的字串）的組不動。
 * - 否則推「組內匯報根」當組長（`deriveInGroupRoot`，與 `deriveGroupLeadership`
 *   回退邏輯共用同一演算法，避免重寫）：
 *   - 候選 = 組內成員中，其「該組那筆 assignment」的 `primarySupervisorId` 為 null、
 *     或主管不在組內者。
 *   - 多候選時 deterministic：組內有效層級最高（深度最小）→ 組內直接部屬數最多
 *     → employeeId 升冪第一。
 *   - 無成員 → `leaderId = null`。
 *
 * 可 export 供 QA 單測。純函式、不可變（回傳新 Group 陣列）。
 */
export function backfillGroupLeaders(data: OrgData): Group[] {
  return asArray<Group>(data.groups).map((g) => {
    if (g.leaderId !== undefined && g.leaderId !== null) return g;
    return { ...g, leaderId: deriveInGroupRoot(data, g.id) };
  });
}

/**
 * v3 → v4：為 `Group` 補上 `leaderId`（組長）。
 * - 以「組內匯報根」回填缺漏的 `leaderId`；空組為 null。
 * - co-leader 採推導不落地（`groupLeadership.deriveGroupLeadership`），不進 schema。
 */
const toV4: Migration = {
  to: 4,
  migrate: (raw) => {
    const data = raw as OrgData;
    const groups = backfillGroupLeaders(data);
    return { ...data, schemaVersion: 4, groups };
  },
};

export const orgMigrations: Migration[] = [toV1, toV2, toV3, toV4];

/** 將任意版本的組織資料升級到目前 schema 版本。 */
export function migrateOrgData(raw: unknown): OrgData {
  return runMigrations<OrgData>(raw, ORG_SCHEMA_VERSION, orgMigrations);
}
