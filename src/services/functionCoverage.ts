import type { Employee, Group, OrgData } from '../types/org';

/** 姓名排序用中文 collation（繁中），避免 CJK 走 Unicode 碼點序而與中文序相反。 */
const nameCollator = new Intl.Collator('zh-Hant');

/** 單一職能（function group）的成員一覽。 */
export interface FunctionMember {
  assignmentId: string;
  employee: Employee;
  /** 此筆歸屬是否帶 primarySupervisorId（用以判斷職能是否有 lead）。 */
  hasSupervisor: boolean;
}

/** 單一職能的覆蓋摘要。 */
export interface FunctionCoverageEntry {
  group: Group;
  members: FunctionMember[];
  /** 任一成員歸屬帶 primarySupervisorId 即視為「有 lead」。 */
  hasLead: boolean;
}

/** 跨職能負載：一個人同時隸屬幾個 function。 */
export interface CrossFunctionLoad {
  employee: Employee;
  /** 該員工所屬 function 數（依 assignment 計）。 */
  functionCount: number;
  /** 所屬 function 的名稱（依組別代碼排序），供 UI 顯示。 */
  functionNames: string[];
}

/** 職能視角彙總結果（純資料，供 UI 取用）。 */
export interface FunctionCoverage {
  /** 每個 function group 的成員與 lead 狀態（依組別代碼排序）。 */
  functions: FunctionCoverageEntry[];
  /** 無成員的職能（覆蓋缺口）。 */
  functionsWithoutMembers: Group[];
  /** 無 lead 的職能（無任一 assignment 帶 primarySupervisorId）。 */
  functionsWithoutLead: Group[];
  /** 跨職能負載（functionCount 由高到低；同分依姓名）。 */
  crossFunctionLoad: CrossFunctionLoad[];
}

/**
 * 由 OrgData 萃取「職能視角」資料（純函式）。
 *
 * 僅納入 `kind === 'function'` 的組別；department 不在此視角內。
 * lead 判定：該職能任一 assignment 帶 `primarySupervisorId` 即視為有 lead。
 */
export function buildFunctionCoverage(data: OrgData): FunctionCoverage {
  const employeeById = new Map(data.employees.map((e) => [e.id, e]));

  const functionGroups = data.groups
    .filter((g) => g.kind === 'function')
    .sort((a, b) => a.code.localeCompare(b.code));

  const functions: FunctionCoverageEntry[] = functionGroups.map((group) => {
    const members: FunctionMember[] = data.assignments
      .filter((a) => a.groupId === group.id)
      .map((a) => {
        const employee = employeeById.get(a.employeeId);
        return employee
          ? {
              assignmentId: a.id,
              employee,
              hasSupervisor: a.primarySupervisorId != null,
            }
          : null;
      })
      .filter((m): m is FunctionMember => m !== null);

    return {
      group,
      members,
      hasLead: members.some((m) => m.hasSupervisor),
    };
  });

  const functionsWithoutMembers = functions
    .filter((f) => f.members.length === 0)
    .map((f) => f.group);

  const functionsWithoutLead = functions
    .filter((f) => f.members.length > 0 && !f.hasLead)
    .map((f) => f.group);

  // 跨職能負載：彙總每位員工所屬的 function（去重，依組別計一次）。
  const loadByEmployee = new Map<string, Set<string>>();
  for (const f of functions) {
    for (const m of f.members) {
      const set = loadByEmployee.get(m.employee.id) ?? new Set<string>();
      set.add(f.group.id);
      loadByEmployee.set(m.employee.id, set);
    }
  }

  const groupNameById = new Map(functionGroups.map((g) => [g.id, g]));
  const crossFunctionLoad: CrossFunctionLoad[] = [...loadByEmployee.entries()]
    .map(([employeeId, groupIds]) => {
      const employee = employeeById.get(employeeId)!;
      const functionNames = [...groupIds]
        .map((id) => groupNameById.get(id))
        .filter((g): g is Group => g != null)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((g) => g.name);
      return { employee, functionCount: groupIds.size, functionNames };
    })
    .sort(
      (a, b) =>
        b.functionCount - a.functionCount ||
        nameCollator.compare(a.employee.name, b.employee.name),
    );

  return {
    functions,
    functionsWithoutMembers,
    functionsWithoutLead,
    crossFunctionLoad,
  };
}
