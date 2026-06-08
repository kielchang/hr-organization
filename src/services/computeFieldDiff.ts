import type {
  Assignment,
  ChangeEntry,
  Employee,
  Group,
  OrgData,
} from '../types/org';

export type FieldDiffEntityType = 'employee' | 'group' | 'assignment';
export type FieldDiffKind = 'added' | 'removed' | 'modified';

export interface FieldChange {
  /** 穩定邏輯鍵（如 'primarySupervisorId'）。 */
  key: string;
  /** 中文欄位名（如 '主管'）。 */
  label: string;
  /** 已解析為人類可讀（員工／組別／職級名稱）；無值用 null。 */
  before: string | null;
  /** 已解析為人類可讀（員工／組別／職級名稱）；無值用 null。 */
  after: string | null;
}

export interface EntityFieldDiff {
  type: FieldDiffEntityType;
  kind: FieldDiffKind;
  id: string;
  /** 顯示標題。 */
  title: string;
  /** modified 才有；added/removed 為 []。 */
  fields: FieldChange[];
}

export interface FieldDiffResult {
  entries: EntityFieldDiff[];
  /** = entries.length。 */
  totalEntities: number;
  /** 所有 entries.fields 數總和。 */
  totalFieldChanges: number;
}

const NONE_LABEL = '（無）';
const AUTO_LABEL = '自動';

/**
 * 名稱解析器：以 base ∪ draft 的聯集建立 id→名稱對照（優先 draft、回退 base），
 * 讓「被移除」的實體仍能解析出名稱。
 */
interface NameResolver {
  employeeName: (id: string | null | undefined) => string | null;
  groupName: (id: string | null | undefined) => string | null;
  jobLevelName: (id: string | null | undefined) => string | null;
}

function buildResolver(base: OrgData, draft: OrgData): NameResolver {
  const empMap = new Map<string, string>();
  for (const e of base.employees) empMap.set(e.id, e.name);
  for (const e of draft.employees) empMap.set(e.id, e.name); // draft 覆蓋 base

  const groupMap = new Map<string, string>();
  for (const g of base.groups) groupMap.set(g.id, g.name);
  for (const g of draft.groups) groupMap.set(g.id, g.name);

  const jobLevelMap = new Map<string, string>();
  for (const j of base.jobLevels) jobLevelMap.set(j.id, j.name);
  for (const j of draft.jobLevels) jobLevelMap.set(j.id, j.name);

  const resolve =
    (map: Map<string, string>) => (id: string | null | undefined) => {
      if (id === null || id === undefined || id === '') return null;
      return map.get(id) ?? id; // 查無則回退原 id（不致顯示空白）
    };

  return {
    employeeName: resolve(empMap),
    groupName: resolve(groupMap),
    jobLevelName: resolve(jobLevelMap),
  };
}

function statusLabel(status: string): string {
  return status === 'active' ? '在職' : '停用';
}

function groupStatusLabel(status: string): string {
  return status === 'active' ? '啟用' : '停用';
}

function groupKindLabel(kind: string): string {
  return kind === 'department' ? '部門' : '職能';
}

/** dotted（虛線）主管＝supervisorIds 去掉 primarySupervisorId 後的姓名逗號串；空回 null。 */
function dottedSupervisorsValue(
  assignment: Assignment,
  resolver: NameResolver,
): string | null {
  const dotted = assignment.supervisorIds.filter(
    (s) => s !== assignment.primarySupervisorId,
  );
  if (dotted.length === 0) return null;
  return dotted
    .map((id) => resolver.employeeName(id) ?? id)
    .join('、');
}

function levelValue(level: number | null | undefined): string | null {
  if (level === null || level === undefined) return null;
  return String(level);
}

/**
 * 以「目前值」與「先前值」是否相等決定是否產一筆 FieldChange。
 * 顯示時 null 統一以對應的「無／自動」佔位文字呈現。
 */
function pushChange(
  changes: FieldChange[],
  key: string,
  label: string,
  beforeRaw: string | null,
  afterRaw: string | null,
  emptyLabel: string = NONE_LABEL,
): void {
  if (beforeRaw === afterRaw) return;
  changes.push({
    key,
    label,
    before: beforeRaw ?? emptyLabel,
    after: afterRaw ?? emptyLabel,
  });
}

/**
 * 共用 assignment 欄位比對 helper：被 {@link computeFieldDiff} 與
 * {@link diffChangeEntryFields} 兩處共用，避免邏輯重複。
 *
 * 比對欄位：組別、主管、其他主管(虛線)、主歸屬、層級覆寫、職級。
 */
function diffAssignmentFields(
  before: Assignment,
  after: Assignment,
  resolver: NameResolver,
): FieldChange[] {
  const changes: FieldChange[] = [];

  pushChange(
    changes,
    'groupId',
    '組別',
    resolver.groupName(before.groupId),
    resolver.groupName(after.groupId),
  );
  pushChange(
    changes,
    'primarySupervisorId',
    '主管',
    resolver.employeeName(before.primarySupervisorId),
    resolver.employeeName(after.primarySupervisorId),
  );
  pushChange(
    changes,
    'supervisorIds',
    '其他主管（虛線）',
    dottedSupervisorsValue(before, resolver),
    dottedSupervisorsValue(after, resolver),
  );
  pushChange(
    changes,
    'isPrimaryGroup',
    '主歸屬',
    before.isPrimaryGroup ? '是' : '否',
    after.isPrimaryGroup ? '是' : '否',
  );
  pushChange(
    changes,
    'level',
    '層級覆寫',
    levelValue(before.level),
    levelValue(after.level),
    AUTO_LABEL,
  );
  pushChange(
    changes,
    'jobLevelId',
    '職級',
    resolver.jobLevelName(before.jobLevelId),
    resolver.jobLevelName(after.jobLevelId),
  );

  return changes;
}

function diffEmployeeFields(before: Employee, after: Employee): FieldChange[] {
  const changes: FieldChange[] = [];
  pushChange(changes, 'name', '姓名', before.name, after.name);
  pushChange(changes, 'employeeNo', '工號', before.employeeNo, after.employeeNo);
  pushChange(
    changes,
    'status',
    '狀態',
    statusLabel(before.status),
    statusLabel(after.status),
  );
  return changes;
}

function diffGroupFields(
  before: Group,
  after: Group,
  resolver: NameResolver,
): FieldChange[] {
  const changes: FieldChange[] = [];
  pushChange(changes, 'name', '組名', before.name, after.name);
  pushChange(changes, 'code', '代碼', before.code, after.code);
  pushChange(
    changes,
    'parentId',
    '上級組',
    resolver.groupName(before.parentId),
    resolver.groupName(after.parentId),
  );
  pushChange(
    changes,
    'kind',
    '類型',
    groupKindLabel(before.kind),
    groupKindLabel(after.kind),
  );
  pushChange(
    changes,
    'status',
    '狀態',
    groupStatusLabel(before.status),
    groupStatusLabel(after.status),
  );
  pushChange(
    changes,
    'leaderId',
    '組長',
    resolver.employeeName(before.leaderId),
    resolver.employeeName(after.leaderId),
  );
  return changes;
}

function assignmentTitle(assignment: Assignment, resolver: NameResolver): string {
  const emp = resolver.employeeName(assignment.employeeId) ?? assignment.employeeId;
  const grp = resolver.groupName(assignment.groupId) ?? assignment.groupId;
  return `${emp}（${grp}）`;
}

/**
 * 欄位級 before→new diff（base＝進編輯的已發布快照、draft＝目前草稿）。
 *
 * 排序為 deterministic（供測試斷言）：
 * - type 群組順序：assignment → employee → group。
 * - 每個 type 群組內，依 `kind` 排序 modified(0) → added(1) → removed(2)，
 *   同 kind 內再以實體 `id` 字典序（localeCompare）排序。
 *
 * 純函式、無副作用、無 I/O。
 */
export function computeFieldDiff(base: OrgData, draft: OrgData): FieldDiffResult {
  const resolver = buildResolver(base, draft);
  const entries: EntityFieldDiff[] = [];

  // ── assignment ──
  {
    const baseMap = new Map(base.assignments.map((a) => [a.id, a]));
    const draftMap = new Map(draft.assignments.map((a) => [a.id, a]));
    for (const [id, after] of draftMap) {
      const before = baseMap.get(id);
      if (!before) {
        entries.push({
          type: 'assignment',
          kind: 'added',
          id,
          title: assignmentTitle(after, resolver),
          fields: [],
        });
      } else {
        // 以語意欄位 helper 算淨差異；僅在有「我們會呈現的欄位」變動時才視為 modified。
        const fields = diffAssignmentFields(before, after, resolver);
        if (fields.length > 0) {
          entries.push({
            type: 'assignment',
            kind: 'modified',
            id,
            title: assignmentTitle(after, resolver),
            fields,
          });
        }
      }
    }
    for (const [id, before] of baseMap) {
      if (!draftMap.has(id)) {
        entries.push({
          type: 'assignment',
          kind: 'removed',
          id,
          title: assignmentTitle(before, resolver),
          fields: [],
        });
      }
    }
  }

  // ── employee ──
  {
    const baseMap = new Map(base.employees.map((e) => [e.id, e]));
    const draftMap = new Map(draft.employees.map((e) => [e.id, e]));
    for (const [id, after] of draftMap) {
      const before = baseMap.get(id);
      if (!before) {
        entries.push({
          type: 'employee',
          kind: 'added',
          id,
          title: after.name,
          fields: [],
        });
      } else {
        const fields = diffEmployeeFields(before, after);
        if (fields.length > 0) {
          entries.push({
            type: 'employee',
            kind: 'modified',
            id,
            title: after.name,
            fields,
          });
        }
      }
    }
    for (const [id, before] of baseMap) {
      if (!draftMap.has(id)) {
        entries.push({
          type: 'employee',
          kind: 'removed',
          id,
          title: before.name,
          fields: [],
        });
      }
    }
  }

  // ── group ──
  {
    const baseMap = new Map(base.groups.map((g) => [g.id, g]));
    const draftMap = new Map(draft.groups.map((g) => [g.id, g]));
    for (const [id, after] of draftMap) {
      const before = baseMap.get(id);
      if (!before) {
        entries.push({
          type: 'group',
          kind: 'added',
          id,
          title: after.name,
          fields: [],
        });
      } else {
        const fields = diffGroupFields(before, after, resolver);
        if (fields.length > 0) {
          entries.push({
            type: 'group',
            kind: 'modified',
            id,
            title: after.name,
            fields,
          });
        }
      }
    }
    for (const [id, before] of baseMap) {
      if (!draftMap.has(id)) {
        entries.push({
          type: 'group',
          kind: 'removed',
          id,
          title: before.name,
          fields: [],
        });
      }
    }
  }

  // Deterministic 排序：type 群組順序 → kind 順序 → id 字典序。
  const typeOrder: Record<FieldDiffEntityType, number> = {
    assignment: 0,
    employee: 1,
    group: 2,
  };
  const kindOrder: Record<FieldDiffKind, number> = {
    modified: 0,
    added: 1,
    removed: 2,
  };
  entries.sort((a, b) => {
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    if (kindOrder[a.kind] !== kindOrder[b.kind]) {
      return kindOrder[a.kind] - kindOrder[b.kind];
    }
    return a.id.localeCompare(b.id);
  });

  const totalFieldChanges = entries.reduce(
    (sum, e) => sum + e.fields.length,
    0,
  );

  return {
    entries,
    totalEntities: entries.length,
    totalFieldChanges,
  };
}

/**
 * 本次編輯 session 產生的 changeLog：draft.changeLog 中 id 不在 base.changeLog
 * id 集合內的條目，保持原順序（既有 prepend → newest-first）。
 */
export function sessionChangeEntries(
  base: OrgData,
  draft: OrgData,
): ChangeEntry[] {
  const baseIds = new Set(base.changeLog.map((c) => c.id));
  return draft.changeLog.filter((c) => !baseIds.has(c.id));
}

/**
 * 把一筆「帶 before/after 的 assignment 操作」entry 解析成欄位級變更，供操作流水逐筆展開。
 *
 * 僅處理 before/after 皆可 parse 為 Assignment 的情形（assignment_update 路徑）；
 * 解析失敗、缺 before/after，或非 assignment 類型一律回 []。
 */
export function diffChangeEntryFields(
  entry: ChangeEntry,
  base: OrgData,
  draft: OrgData,
): FieldChange[] {
  if (!entry.before || !entry.after) return [];
  let before: Assignment;
  let after: Assignment;
  try {
    before = JSON.parse(entry.before) as Assignment;
    after = JSON.parse(entry.after) as Assignment;
  } catch {
    return [];
  }
  // 形狀檢查：須像 Assignment（具 supervisorIds 陣列），否則非本函式可解析的類型。
  if (
    !before ||
    !after ||
    !Array.isArray(before.supervisorIds) ||
    !Array.isArray(after.supervisorIds)
  ) {
    return [];
  }
  const resolver = buildResolver(base, draft);
  return diffAssignmentFields(before, after, resolver);
}
