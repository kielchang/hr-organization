import type {
  Assignment,
  ChangeEntry,
  ChangeType,
  Employee,
  Group,
  OrgData,
} from '../types/org';
import {
  detectReportingCycleFromAssignments,
  validateAssignment,
} from './validators';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function appendChange(
  data: OrgData,
  changeType: ChangeType,
  summary: string,
  operator: string,
  before?: string,
  after?: string,
): OrgData {
  const entry: ChangeEntry = {
    id: newId('chg'),
    timestamp: new Date().toISOString(),
    operator,
    changeType,
    summary,
    before,
    after,
  };
  return {
    ...data,
    changeLog: [entry, ...data.changeLog],
  };
}

export function upsertEmployee(
  data: OrgData,
  employee: Employee,
  operator: string,
  isNew: boolean,
): { data: OrgData; error?: string } {
  let next = { ...data };
  if (isNew) {
    if (data.employees.some((e) => e.employeeNo === employee.employeeNo)) {
      return { data, error: '工號已存在' };
    }
    next = {
      ...next,
      employees: [...next.employees, employee],
    };
    next = appendChange(
      next,
      'employee_create',
      `新增員工：${employee.name}`,
      operator,
    );
  } else {
    next = {
      ...next,
      employees: next.employees.map((e) =>
        e.id === employee.id ? employee : e,
      ),
    };
    next = appendChange(
      next,
      'employee_update',
      `更新員工：${employee.name}`,
      operator,
    );
  }
  return { data: next };
}

export function deleteEmployee(
  data: OrgData,
  employeeId: string,
  operator: string,
): OrgData {
  const emp = data.employees.find((e) => e.id === employeeId);
  let next: OrgData = {
    ...data,
    employees: data.employees.filter((e) => e.id !== employeeId),
    assignments: data.assignments.filter((a) => a.employeeId !== employeeId),
  };
  next.assignments = next.assignments.map((a) => ({
    ...a,
    supervisorIds: a.supervisorIds.filter((s) => s !== employeeId),
    primarySupervisorId:
      a.primarySupervisorId === employeeId ? null : a.primarySupervisorId,
  }));
  if (emp) {
    next = appendChange(
      next,
      'employee_delete',
      `刪除員工：${emp.name}`,
      operator,
    );
  }
  return next;
}

export function upsertGroup(
  data: OrgData,
  group: Group,
  operator: string,
  isNew: boolean,
): { data: OrgData; error?: string } {
  if (group.parentId === group.id) {
    return { data, error: '組別不可將自己設為上層' };
  }
  let next = { ...data };
  if (isNew) {
    if (data.groups.some((g) => g.code === group.code)) {
      return { data, error: '組別代碼已存在' };
    }
    next = { ...next, groups: [...next.groups, group] };
    next = appendChange(next, 'group_create', `新增組別：${group.name}`, operator);
  } else {
    next = {
      ...next,
      groups: next.groups.map((g) => (g.id === group.id ? group : g)),
    };
    next = appendChange(next, 'group_update', `更新組別：${group.name}`, operator);
  }
  return { data: next };
}

export function upsertAssignment(
  data: OrgData,
  assignment: Assignment,
  operator: string,
  isNew: boolean,
): { data: OrgData; error?: string } {
  const errors = validateAssignment(assignment, data, isNew ? undefined : assignment.id);
  if (errors.length) return { data, error: errors.join('；') };

  let next = { ...data, assignments: [...data.assignments] };

  if (assignment.isPrimaryGroup) {
    next.assignments = next.assignments.map((a) =>
      a.employeeId === assignment.employeeId && a.id !== assignment.id
        ? { ...a, isPrimaryGroup: false }
        : a,
    );
  }

  if (isNew) {
    next.assignments = [...next.assignments, assignment];
    next = appendChange(
      next,
      'assignment_create',
      `新增歸屬：員工 ${assignment.employeeId} → 組別 ${assignment.groupId}`,
      operator,
    );
  } else {
    const prev = data.assignments.find((a) => a.id === assignment.id);
    next.assignments = next.assignments.map((a) =>
      a.id === assignment.id ? assignment : a,
    );
    next = appendChange(
      next,
      'assignment_update',
      `更新歸屬：${assignment.id}`,
      operator,
      prev ? JSON.stringify(prev) : undefined,
      JSON.stringify(assignment),
    );
  }
  return { data: next };
}

export function deleteAssignment(
  data: OrgData,
  assignmentId: string,
  operator: string,
): OrgData {
  const prev = data.assignments.find((a) => a.id === assignmentId);
  let next: OrgData = {
    ...data,
    assignments: data.assignments.filter((a) => a.id !== assignmentId),
  };
  if (prev) {
    next = appendChange(
      next,
      'assignment_delete',
      `刪除歸屬：${prev.id}`,
      operator,
      JSON.stringify(prev),
    );
  }
  return next;
}

export function importOrgData(
  data: OrgData,
  operator: string,
): OrgData {
  return appendChange(
    { ...data, changeLog: data.changeLog },
    'import',
    '從檔案載入組織資料',
    operator,
  );
}

/**
 * 拖人改匯報線：把 `assignmentId` 那筆歸屬的「主主管」改成 `newSupervisorId`。
 *
 * 行為：
 * - 設 `primarySupervisorId = newSupervisorId`；`supervisorIds` 去掉舊的主主管、確保含新主管、
 *   其餘 dotted（虛線）主管保留。
 * - **清除該歸屬的 `level` 覆寫**（設為 `undefined`），讓被拖者跟隨新主管的計算深度
 *   （換了主管、層級自然跟著走）。
 * - 走既有 `upsertAssignment`（內含 `validateAssignment`：擋自我指派、inactive、找不到員工/組別等）。
 * - 循環防護：套用後以 `detectReportingCycleFromAssignments` 檢查整體匯報關係；若偵測到循環，
 *   **不套用**並回 `error`（畫面端據此回滾節點位置）。
 *
 * @returns `{ data, error }`；`error === null` 代表成功，`data` 為套用後的新資料。
 *          失敗時 `data` 為**原資料**（未變動）。
 */
export function reassignSupervisor(
  data: OrgData,
  assignmentId: string,
  newSupervisorId: string,
  operator: string,
): { data: OrgData; error: string | null } {
  const assignment = data.assignments.find((a) => a.id === assignmentId);
  if (!assignment) {
    return { data, error: '找不到要調整的歸屬紀錄' };
  }

  // 自我指派防禦（理論上 getIntersectingNodes 不含自己，仍守一層）。
  if (newSupervisorId === assignment.employeeId) {
    return { data, error: '主管不可為本人' };
  }

  const oldPrimary = assignment.primarySupervisorId;
  // 去掉舊主主管，保留其他（dotted）主管，再確保含新主管。
  const retained = assignment.supervisorIds.filter(
    (s) => s !== oldPrimary && s !== newSupervisorId,
  );
  const nextSupervisorIds = [newSupervisorId, ...retained];

  const updated: Assignment = {
    ...assignment,
    supervisorIds: nextSupervisorIds,
    primarySupervisorId: newSupervisorId,
    // 清除手動層級覆寫，跟隨新主管的計算深度。
    level: undefined,
  };

  // 走既有 upsert（含 validateAssignment：自我/inactive/找不到主管等）。
  const result = upsertAssignment(data, updated, operator, false);
  if (result.error) {
    return { data, error: result.error };
  }

  // 循環防護：套用後檢查整體匯報關係，有循環則整筆不套用。
  const cycle = detectReportingCycleFromAssignments(result.data.assignments);
  if (cycle.length > 0) {
    return { data, error: '此調整會造成匯報循環，已取消' };
  }

  return { data: result.data, error: null };
}

/**
 * 拖人改組別：把 `assignmentId` 那筆歸屬的 `groupId` 改成 `newGroupId`。
 *
 * 行為（仿 {@link reassignSupervisor} 契約）：
 * - 找到該筆歸屬，將 `groupId` 改為 `newGroupId`。
 * - **清除該歸屬的 `level` 覆寫**（設為 `undefined`）：換組後層級跟隨新組計算深度。
 * - 走既有 `upsertAssignment`（內含 `validateAssignment`：自動擋「同員工在新組已有
 *   歸屬」重複、inactive 組、找不到組別等）。
 * - 循環防護：套用後以 `detectReportingCycleFromAssignments` 檢查整體匯報關係；若偵測到
 *   循環，**不套用**並回 `error`（畫面端據此回滾節點位置）。
 * - **同組 no-op**：`newGroupId === 原 groupId` → 回原資料、`error: null`（不寫 changeLog）。
 * - 找不到該歸屬 / 該歸屬為 co-leader（`assignmentId` 為空，理論上 UI 已擋）→ 回 `error`。
 *
 * @returns `{ data, error }`；`error === null` 代表成功，`data` 為套用後的新資料。
 *          失敗時 `data` 為**原資料**（未變動）。
 */
export function reassignEmployeeGroup(
  data: OrgData,
  assignmentId: string,
  newGroupId: string,
  operator: string,
): { data: OrgData; error: string | null } {
  if (!assignmentId) {
    return { data, error: '此節點無可調整的歸屬紀錄' };
  }

  const assignment = data.assignments.find((a) => a.id === assignmentId);
  if (!assignment) {
    return { data, error: '找不到要調整的歸屬紀錄' };
  }

  // 同組：無實質變更，回原資料（不寫 changeLog）。
  if (assignment.groupId === newGroupId) {
    return { data, error: null };
  }

  // 主歸屬只能落在部門組（與 validateOrgData 同規則；validateAssignment 不含此檢查，於此補擋）。
  const newGroup = data.groups.find((g) => g.id === newGroupId);
  if (assignment.isPrimaryGroup === true && newGroup?.kind !== 'department') {
    return { data, error: '主歸屬只能落在部門，無法改入職能組' };
  }

  const updated: Assignment = {
    ...assignment,
    groupId: newGroupId,
    // 清除手動層級覆寫，換組後跟隨新組計算深度。
    level: undefined,
  };

  // 驗證（沿用 validateAssignment：擋同員工在新組已有歸屬、inactive 組、找不到組別等）。
  // 直接驗證＋套用（不走 upsertAssignment 以免其寫入 generic changeLog；此處改寫可讀摘要）。
  const errors = validateAssignment(updated, data, updated.id);
  if (errors.length) {
    return { data, error: errors.join('；') };
  }

  let next: OrgData = {
    ...data,
    assignments: data.assignments.map((a) => (a.id === updated.id ? updated : a)),
  };

  // 循環防護：換組可能改變顯示集合內的匯報關係，套用後檢查整體匯報，有循環則整筆不套用。
  const cycle = detectReportingCycleFromAssignments(next.assignments);
  if (cycle.length > 0) {
    return { data, error: '此調整會造成匯報循環，已取消' };
  }

  // changeLog 摘要：以可讀的員工/組別名稱呈現（查無則回退 id）。
  const emp = data.employees.find((e) => e.id === assignment.employeeId);
  next = appendChange(
    next,
    'assignment_update',
    `改組別：員工 ${emp?.name ?? assignment.employeeId} → 組別 ${newGroup?.name ?? newGroupId}`,
    operator,
  );

  return { data: next, error: null };
}

export function createEmptyAssignment(employeeId: string): Assignment {
  return {
    id: newId('a'),
    employeeId,
    groupId: '',
    jobLevelId: '',
    supervisorIds: [],
    primarySupervisorId: null,
    isPrimaryGroup: false,
    level: 1,
  };
}
