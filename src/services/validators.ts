import type { Assignment, Employee, OrgData } from '../types/org';

export function validateAssignment(
  assignment: Assignment,
  data: OrgData,
  excludeId?: string,
): string[] {
  const errors: string[] = [];
  const employee = data.employees.find((e) => e.id === assignment.employeeId);
  const group = data.groups.find((g) => g.id === assignment.groupId);

  if (!employee) errors.push('找不到員工');
  if (!group) errors.push('找不到組別');
  if (group?.status === 'inactive') errors.push('組別已停用，無法新增或維護歸屬');

  const duplicate = data.assignments.some(
    (a) =>
      a.id !== excludeId &&
      a.employeeId === assignment.employeeId &&
      a.groupId === assignment.groupId,
  );
  if (duplicate) errors.push('同一員工在此組別已有歸屬紀錄');

  if (assignment.supervisorIds.includes(assignment.employeeId)) {
    errors.push('主管不可為本人');
  }

  for (const sid of assignment.supervisorIds) {
    const sup = data.employees.find((e) => e.id === sid);
    if (!sup) errors.push(`找不到主管：${sid}`);
    else if (sup.status !== 'active') errors.push(`主管 ${sup.name} 非在職狀態`);
  }

  if (
    assignment.primarySupervisorId &&
    !assignment.supervisorIds.includes(assignment.primarySupervisorId)
  ) {
    errors.push('主主管必須包含在主管清單中');
  }

  const jobLevel = data.jobLevels.find((j) => j.id === assignment.jobLevelId);
  if (!jobLevel) errors.push('找不到職級');

  return errors;
}

export function detectReportingCycleFromAssignments(
  assignments: Assignment[],
): string[] {
  const adjacency = new Map<string, string[]>();

  for (const a of assignments) {
    const targets = a.supervisorIds.filter((s) => s !== a.employeeId);
    const prev = adjacency.get(a.employeeId) ?? [];
    adjacency.set(a.employeeId, [...new Set([...prev, ...targets])]);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const errors: string[] = [];

  const dfs = (node: string, path: string[]): void => {
    if (stack.has(node)) {
      errors.push(`循環匯報：${[...path, node].join(' → ')}`);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    const next = adjacency.get(node) ?? [];
    for (const n of next) dfs(n, [...path, node]);
    stack.delete(node);
  };

  for (const employeeId of adjacency.keys()) {
    dfs(employeeId, []);
  }

  return [...new Set(errors)];
}

export function detectReportingCycle(
  groupId: string,
  assignments: Assignment[],
): string[] {
  return detectReportingCycleFromAssignments(
    assignments.filter((a) => a.groupId === groupId),
  );
}

export function validateOrgData(data: OrgData): string[] {
  const errors: string[] = [];
  for (const a of data.assignments) {
    errors.push(...validateAssignment(a, data, a.id));
  }
  for (const g of data.groups) {
    if (g.parentId) {
      const parent = data.groups.find((x) => x.id === g.parentId);
      if (!parent) errors.push(`組別 ${g.name} 的上層組別不存在`);
    }
  }
  for (const g of data.groups) {
    const cycleErrors = detectReportingCycle(g.id, data.assignments);
    errors.push(...cycleErrors.map((e) => `[${g.name}] ${e}`));
  }
  return [...new Set(errors)];
}

export function getActiveEmployees(employees: Employee[]): Employee[] {
  return employees.filter((e) => e.status === 'active');
}
