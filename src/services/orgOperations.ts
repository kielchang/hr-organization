import type {
  Assignment,
  ChangeEntry,
  ChangeType,
  Employee,
  Group,
  OrgData,
} from '../types/org';
import { validateAssignment } from './validators';

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

export function createEmptyAssignment(employeeId: string): Assignment {
  return {
    id: newId('a'),
    employeeId,
    groupId: '',
    jobLevelId: '',
    supervisorIds: [],
    primarySupervisorId: null,
    isPrimaryGroup: false,
  };
}
