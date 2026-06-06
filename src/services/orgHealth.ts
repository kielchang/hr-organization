import type { Assignment, Employee, OrgData } from '../types/org';
import { backfillAssignmentLevels } from './assignmentLevels';
import {
  buildFunctionCoverage,
  type FunctionCoverage,
} from './functionCoverage';
import { detectReportingCycleFromAssignments } from './validators';

/** 姓名排序用中文 collation（繁中），對齊 functionCoverage 的排序語意。 */
const nameCollator = new Intl.Collator('zh-Hant');

/** 預設管理幅度過寬門檻：directReports 超過此值視為過寬。 */
const DEFAULT_WIDE_SPAN_THRESHOLD = 8;
/** 預設層級過深門檻：maxDepth 超過此值給一筆 info finding。 */
const DEFAULT_DEEP_DEPTH_THRESHOLD = 6;
/** 跨職能高負載「前段」：functionCount 達此值即視為高負載，給 info finding。 */
const CROSS_FUNCTION_HIGH_LOAD = 3;

/** 單一主管的管理幅度條目（含主管本人與其不重複 active 直接部屬數）。 */
export interface SpanEntry {
  supervisor: Employee;
  directReports: number;
}

/** 管理幅度（span of control）彙總。 */
export interface SpanOfControl {
  /** 依 directReports 降冪（同分依主管姓名）。 */
  entries: SpanEntry[];
  /** 有部屬的主管平均直接部屬數（無主管時為 0）。 */
  average: number;
  max: number;
  min: number;
  /** 有 ≥1 直接部屬的主管數。 */
  supervisorCount: number;
  /** directReports > wideSpanThreshold（過寬）。 */
  wide: SpanEntry[];
  /** directReports === 1（潛在冗餘層級）。 */
  narrow: SpanEntry[];
}

/** 層級深度（depth）彙總，依各員工主歸屬的 Assignment.level。 */
export interface DepthStat {
  maxDepth: number;
  /** 各層人數（依 level 升冪）。 */
  perLevel: { level: number; count: number }[];
}

/** 跨類別的扁平健檢訊號。 */
export interface OrgHealthFinding {
  /** 穩定可預期字串（如 `span-wide:<empId>`），供測試斷言與 UI key。 */
  id: string;
  severity: 'warning' | 'info';
  category: 'span' | 'depth' | 'function' | 'chain' | 'cycle' | 'spof';
  /** 繁中、可讀、可行動。 */
  message: string;
  /** 供 UI 連結（指向員工）。 */
  employeeId?: string;
  /** 供 UI 連結（指向組別）。 */
  groupId?: string;
}

/** 摘要卡片列所需的高層指標。 */
export interface OrgHealthSummary {
  activeEmployees: number;
  /** kind==='department' 且 active。 */
  departments: number;
  /** kind==='function' 且 active。 */
  functions: number;
  /** 有 ≥1 直接部屬的人。 */
  supervisors: number;
  avgSpan: number;
  maxDepth: number;
  /** findings 中 severity==='warning' 數。 */
  warningCount: number;
}

/** 規劃健檢的單一彙總結果（純資料，供 UI 取用）。 */
export interface OrgHealth {
  summary: OrgHealthSummary;
  span: SpanOfControl;
  depth: DepthStat;
  functionCoverage: FunctionCoverage;
  /** 跨類別的扁平警示清單（供清單呈現）。 */
  findings: OrgHealthFinding[];
}

/** 取每位員工的主歸屬（isPrimaryGroup===true）那筆 assignment。 */
function primaryAssignmentByEmployee(
  assignments: Assignment[],
): Map<string, Assignment> {
  const byEmployee = new Map<string, Assignment>();
  for (const a of assignments) {
    if (a.isPrimaryGroup) byEmployee.set(a.employeeId, a);
  }
  return byEmployee;
}

/**
 * 由 OrgData 推導規劃健檢指標與訊號（純函式）。
 *
 * - span 以「主匯報線」計：員工直屬主管＝其主歸屬 assignment 的 primarySupervisorId；
 *   只計 active 員工與 active 主管。
 * - depth 取每位員工主歸屬的 Assignment.level（缺值先以 backfillAssignmentLevels 補齊）。
 * - 職能覆蓋直接 buildFunctionCoverage(data)，並轉成 findings。
 * - 結構風險：chain（孤兒／懸空主管）、cycle（重用 validators）、spof（唯一主管）。
 */
export function buildOrgHealth(
  data: OrgData,
  options?: { wideSpanThreshold?: number },
): OrgHealth {
  const wideSpanThreshold =
    options?.wideSpanThreshold ?? DEFAULT_WIDE_SPAN_THRESHOLD;

  // level 可能缺值（拖拉前未回填）；先補齊再算 depth。
  const normalized = backfillAssignmentLevels(data);

  const employeeById = new Map(normalized.employees.map((e) => [e.id, e]));
  const isActive = (id: string | null | undefined): boolean =>
    id != null && employeeById.get(id)?.status === 'active';

  const activeEmployees = normalized.employees.filter(
    (e) => e.status === 'active',
  );
  const primaryByEmployee = primaryAssignmentByEmployee(normalized.assignments);

  // ---- 管理幅度（span）：以主匯報線計，只計 active 員工 → active 主管 ----
  const reportsBySupervisor = new Map<string, Set<string>>();
  for (const emp of activeEmployees) {
    const primary = primaryByEmployee.get(emp.id);
    const supId = primary?.primarySupervisorId ?? null;
    if (!isActive(supId)) continue;
    const set = reportsBySupervisor.get(supId!) ?? new Set<string>();
    set.add(emp.id);
    reportsBySupervisor.set(supId!, set);
  }

  const entries: SpanEntry[] = [...reportsBySupervisor.entries()]
    .map(([supId, reports]) => ({
      supervisor: employeeById.get(supId)!,
      directReports: reports.size,
    }))
    .sort(
      (a, b) =>
        b.directReports - a.directReports ||
        nameCollator.compare(a.supervisor.name, b.supervisor.name),
    );

  const counts = entries.map((e) => e.directReports);
  const supervisorCount = entries.length;
  const average =
    supervisorCount === 0
      ? 0
      : counts.reduce((sum, n) => sum + n, 0) / supervisorCount;
  const wide = entries.filter((e) => e.directReports > wideSpanThreshold);
  const narrow = entries.filter((e) => e.directReports === 1);

  const span: SpanOfControl = {
    entries,
    average,
    max: counts.length ? Math.max(...counts) : 0,
    min: counts.length ? Math.min(...counts) : 0,
    supervisorCount,
    wide,
    narrow,
  };

  // ---- 層級深度（depth）：取每位 active 員工主歸屬的 level ----
  const countByLevel = new Map<number, number>();
  for (const emp of activeEmployees) {
    const primary = primaryByEmployee.get(emp.id);
    if (!primary) continue; // 孤兒由 chain finding 涵蓋
    const level = primary.level ?? 1;
    countByLevel.set(level, (countByLevel.get(level) ?? 0) + 1);
  }
  const perLevel = [...countByLevel.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => a.level - b.level);
  const maxDepth = perLevel.length
    ? Math.max(...perLevel.map((p) => p.level))
    : 0;
  const depth: DepthStat = { maxDepth, perLevel };

  // ---- 職能覆蓋：直接重用 buildFunctionCoverage ----
  const functionCoverage = buildFunctionCoverage(normalized);

  // ---- findings（跨類別扁平清單）----
  const findings: OrgHealthFinding[] = [];

  // span findings
  for (const e of wide) {
    findings.push({
      id: `span-wide:${e.supervisor.id}`,
      severity: 'warning',
      category: 'span',
      message: `主管「${e.supervisor.name}」直接管理 ${e.directReports} 名部屬（超過 ${wideSpanThreshold}），管理幅度過寬。`,
      employeeId: e.supervisor.id,
    });
  }
  for (const e of narrow) {
    findings.push({
      id: `span-narrow:${e.supervisor.id}`,
      severity: 'info',
      category: 'span',
      message: `主管「${e.supervisor.name}」僅有 1 名直接部屬，可能為冗餘層級。`,
      employeeId: e.supervisor.id,
    });
  }

  // depth finding
  if (maxDepth > DEFAULT_DEEP_DEPTH_THRESHOLD) {
    findings.push({
      id: 'depth-deep',
      severity: 'info',
      category: 'depth',
      message: `最大層級深度為 ${maxDepth}，超過建議值 ${DEFAULT_DEEP_DEPTH_THRESHOLD}，匯報鏈可能過長。`,
    });
  }

  // function findings（重用 functionCoverage 結果）
  for (const g of functionCoverage.functionsWithoutMembers) {
    findings.push({
      id: `function-no-members:${g.id}`,
      severity: 'warning',
      category: 'function',
      message: `職能「${g.name}」尚無任何成員，覆蓋缺口。`,
      groupId: g.id,
    });
  }
  for (const g of functionCoverage.functionsWithoutLead) {
    findings.push({
      id: `function-no-lead:${g.id}`,
      severity: 'warning',
      category: 'function',
      message: `職能「${g.name}」有成員但無 lead（無任一歸屬設定主主管）。`,
      groupId: g.id,
    });
  }
  for (const load of functionCoverage.crossFunctionLoad) {
    if (load.functionCount < CROSS_FUNCTION_HIGH_LOAD) continue;
    findings.push({
      id: `function-cross-load:${load.employee.id}`,
      severity: 'info',
      category: 'function',
      message: `「${load.employee.name}」同時隸屬 ${load.functionCount} 個職能（${load.functionNames.join('、')}），跨職能負載偏高。`,
      employeeId: load.employee.id,
    });
  }

  // chain findings：孤兒（無任何 active 歸屬）與懸空主管（主管不存在或 inactive）
  const employeesWithAnyAssignment = new Set(
    normalized.assignments.map((a) => a.employeeId),
  );
  for (const emp of activeEmployees) {
    if (!employeesWithAnyAssignment.has(emp.id)) {
      findings.push({
        id: `chain-orphan:${emp.id}`,
        severity: 'warning',
        category: 'chain',
        message: `員工「${emp.name}」沒有任何組別歸屬（孤兒節點），不在任何匯報線上。`,
        employeeId: emp.id,
      });
      continue;
    }
    const primary = primaryByEmployee.get(emp.id);
    const supId = primary?.primarySupervisorId ?? null;
    if (supId != null && !isActive(supId)) {
      const supName = employeeById.get(supId)?.name;
      findings.push({
        id: `chain-dangling:${emp.id}`,
        severity: 'warning',
        category: 'chain',
        message: supName
          ? `員工「${emp.name}」的主管「${supName}」已非在職狀態（懸空主管）。`
          : `員工「${emp.name}」的主管不存在（懸空主管），主管 ID：${supId}。`,
        employeeId: emp.id,
      });
    }
  }

  // cycle findings：重用 validators 的匯報循環偵測，每條循環一筆
  const cycles = detectReportingCycleFromAssignments(normalized.assignments);
  cycles.forEach((message, index) => {
    findings.push({
      id: `cycle:${index}`,
      severity: 'warning',
      category: 'cycle',
      message,
    });
  });

  // spof findings：某主管是 ≥2 名部屬的「唯一主管」（部屬主歸屬 supervisorIds 僅含此人）
  const soleDependentsBySupervisor = new Map<string, Employee[]>();
  for (const emp of activeEmployees) {
    const primary = primaryByEmployee.get(emp.id);
    if (!primary) continue;
    const sups = primary.supervisorIds.filter((s) => isActive(s));
    if (sups.length !== 1) continue; // 有備援或無主管 → 非單點
    const soleSup = sups[0];
    const list = soleDependentsBySupervisor.get(soleSup) ?? [];
    list.push(emp);
    soleDependentsBySupervisor.set(soleSup, list);
  }
  for (const [supId, dependents] of soleDependentsBySupervisor) {
    if (dependents.length < 2) continue; // 單一部屬不報，避免噪音
    const supName = employeeById.get(supId)?.name ?? supId;
    findings.push({
      id: `spof:${supId}`,
      severity: 'warning',
      category: 'spof',
      message: `主管「${supName}」是 ${dependents.length} 名部屬的唯一主管，無備援；其不可用會讓多名部屬失去主管。`,
      employeeId: supId,
    });
  }

  // ---- summary ----
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const summary: OrgHealthSummary = {
    activeEmployees: activeEmployees.length,
    departments: normalized.groups.filter(
      (g) => g.kind === 'department' && g.status === 'active',
    ).length,
    functions: normalized.groups.filter(
      (g) => g.kind === 'function' && g.status === 'active',
    ).length,
    supervisors: supervisorCount,
    avgSpan: average,
    maxDepth,
    warningCount,
  };

  return { summary, span, depth, functionCoverage, findings };
}
