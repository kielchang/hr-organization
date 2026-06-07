import type { Assignment, Employee, OrgData } from '../types/org';
import {
  buildFunctionCoverage,
  type FunctionCoverage,
} from './functionCoverage';
import { deriveAllGroupLeadership } from './groupLeadership';
import { computePrimaryDepth, effectiveLevel } from './reportingDepth';
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

/** 層級深度（depth）彙總，依各員工主歸屬的有效層級（主匯報深度，可被 level 覆寫）。 */
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
  category:
    | 'span'
    | 'depth'
    | 'function'
    | 'chain'
    | 'cycle'
    | 'spof'
    | 'group-mismatch'
    | 'parallel-colead';
  /** 繁中、可讀、可行動。 */
  message: string;
  /** 供 UI 連結（指向員工）。 */
  employeeId?: string;
  /** 供 UI 連結（指向組別）。 */
  groupId?: string;
}

/**
 * 過濾「指向某員工」的 findings（純函式，供工作台選中節點看該人提醒）。
 *
 * - 比對 `finding.employeeId === employeeId`。
 * - employeeId 為 null（未選中）時回傳空陣列，由呼叫端決定改顯示全域 findings。
 * - 不改變輸入順序（穩定）；不修改輸入陣列。
 */
export function filterFindingsForEmployee(
  findings: OrgHealthFinding[],
  employeeId: string | null,
): OrgHealthFinding[] {
  if (employeeId == null) return [];
  return findings.filter((f) => f.employeeId === employeeId);
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

/** 規劃就緒度的單一維度（結構面）。 */
export interface ReadinessDimension {
  key: 'span' | 'structure' | 'function' | 'keyPerson';
  /** 繁中：管理幅度健康／結構完整性／職能覆蓋／關鍵人風險。 */
  label: string;
  /** 0–100，由該維度相關 finding 從 100 起扣。 */
  score: number;
  /** 該維度相關 finding 數。 */
  findingCount: number;
}

/** 規劃就緒度（**結構面**，非完整變革就緒度）。 */
export interface ReadinessResult {
  /** 0–100，四維度等權平均。 */
  total: number;
  /** ≥80 high、60–79 medium、<60 low。 */
  level: 'high' | 'medium' | 'low';
  dimensions: ReadinessDimension[];
}

/** warning 每筆扣分（較重）。 */
const READINESS_WARNING_PENALTY = 15;
/** info 每筆扣分（較輕）。 */
const READINESS_INFO_PENALTY = 5;

/** 維度 → 對應的 finding category 與繁中標籤。 */
const READINESS_DIMENSIONS: ReadonlyArray<{
  key: ReadinessDimension['key'];
  label: string;
  categories: ReadonlyArray<OrgHealthFinding['category']>;
}> = [
  { key: 'span', label: '管理幅度健康', categories: ['span'] },
  {
    key: 'structure',
    label: '結構完整性',
    // group-mismatch（主管不屬本組／層級異常）與 chain/cycle 同屬結構面。
    // parallel-colead 為合法的資訊性標示，刻意不納入任何維度（不扣就緒度）。
    categories: ['chain', 'cycle', 'group-mismatch'],
  },
  { key: 'function', label: '職能覆蓋', categories: ['function'] },
  { key: 'keyPerson', label: '關鍵人風險', categories: ['spof'] },
];

/**
 * 由 OrgHealth 推導「結構面」規劃就緒度（純函式）。
 *
 * - 四維度（span／structure／function／keyPerson）各從 100 起扣：
 *   warning 每筆 −15、info 每筆 −5，最低 0。
 * - total＝四維度等權平均（四捨五入到整數）。
 * - level：≥80 high、60–79 medium、<60 low。
 * - 誠實命名：僅涵蓋**結構面**，不含 leadership／comms／sponsor 等變革要素。
 */
export function buildReadiness(health: OrgHealth): ReadinessResult {
  const dimensions: ReadinessDimension[] = READINESS_DIMENSIONS.map((dim) => {
    const related = health.findings.filter((f) =>
      dim.categories.includes(f.category),
    );
    const penalty = related.reduce(
      (sum, f) =>
        sum +
        (f.severity === 'warning'
          ? READINESS_WARNING_PENALTY
          : READINESS_INFO_PENALTY),
      0,
    );
    return {
      key: dim.key,
      label: dim.label,
      score: Math.max(0, 100 - penalty),
      findingCount: related.length,
    };
  });

  const total = Math.round(
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length,
  );
  const level: ReadinessResult['level'] =
    total >= 80 ? 'high' : total >= 60 ? 'medium' : 'low';

  return { total, level, dimensions };
}

/** 單一健檢指標在 base→draft 之間的變化。 */
export interface HealthMetricDelta {
  key: 'avgSpan' | 'maxDepth' | 'warningCount' | 'readiness';
  /** 繁中：平均管理幅度／最大層級／警示數／規劃就緒度。 */
  label: string;
  before: number;
  after: number;
  /**
   * after - before。avgSpan 以 round 到小數 1 位後的 before/after 計算
   * （與顯示精度一致）；其餘為整數指標，即原值差。
   */
  delta: number;
  /**
   * 對該指標 delta 的好壞：
   * avgSpan/maxDepth/warningCount 越小越好；readiness 越大越好；相等 unchanged。
   */
  direction: 'improved' | 'worsened' | 'unchanged';
}

/** base→draft 的健檢指標比較結果（固定 4 項，供編輯態浮層取用）。 */
export interface OrgHealthDelta {
  /** 固定 4 項，順序：avgSpan, maxDepth, warningCount, readiness。 */
  metrics: HealthMetricDelta[];
  /** 任一 metric.delta !== 0。 */
  hasChanges: boolean;
}

/** 「越小越好」指標的方向判定。 */
function lowerIsBetter(before: number, after: number): HealthMetricDelta['direction'] {
  if (after < before) return 'improved';
  if (after > before) return 'worsened';
  return 'unchanged';
}

/** 「越大越好」指標的方向判定。 */
function higherIsBetter(before: number, after: number): HealthMetricDelta['direction'] {
  if (after > before) return 'improved';
  if (after < before) return 'worsened';
  return 'unchanged';
}

/**
 * 由「已算好的」base/draft OrgHealth 推導 4 指標 delta（純函式）。
 *
 * 抽出此函式以利呼叫端快取 base/draft 的 buildOrgHealth 結果（base 在編輯 session 內
 * 不變，可只算一次）；演算法與 compareOrgHealth 完全一致——後者即為「先 buildOrgHealth
 * 兩次再呼叫本函式」的薄包裝，行為與輸出不變。
 *
 * - readiness 由本函式內部 buildReadiness(health).total 取得（與舊實作一致）。
 * - 4 指標固定順序：avgSpan, maxDepth, warningCount, readiness。
 * - avgSpan/maxDepth/warningCount 越小越好；readiness 越大越好（見 direction 規則）。
 * - avgSpan「越小越好」為 v1 簡化假設（過小亦非理想，但主訊號是警示減少）。
 * - avgSpan 的 before/after/delta/direction 皆以「四捨五入到小數 1 位」後的值計算，
 *   與 UI 顯示精度（toFixed(1)）一致，避免「4.8→4.8 卻標改善 −0.1」的矛盾；
 *   maxDepth/warningCount/readiness 為整數，沿用原值。
 */
export function buildHealthDelta(
  baseHealth: OrgHealth,
  draftHealth: OrgHealth,
): OrgHealthDelta {
  const baseReadiness = buildReadiness(baseHealth).total;
  const draftReadiness = buildReadiness(draftHealth).total;

  // avgSpan 顯示為 1 位小數，方向/差值也須以 round 後的值計算，四者才會自洽。
  const round1 = (v: number): number => Math.round(v * 10) / 10;
  const avgSpanBefore = round1(baseHealth.summary.avgSpan);
  const avgSpanAfter = round1(draftHealth.summary.avgSpan);

  const metrics: HealthMetricDelta[] = [
    {
      key: 'avgSpan',
      label: '平均管理幅度',
      before: avgSpanBefore,
      after: avgSpanAfter,
      delta: avgSpanAfter - avgSpanBefore,
      direction: lowerIsBetter(avgSpanBefore, avgSpanAfter),
    },
    {
      key: 'maxDepth',
      label: '最大層級',
      before: baseHealth.summary.maxDepth,
      after: draftHealth.summary.maxDepth,
      delta: draftHealth.summary.maxDepth - baseHealth.summary.maxDepth,
      direction: lowerIsBetter(
        baseHealth.summary.maxDepth,
        draftHealth.summary.maxDepth,
      ),
    },
    {
      key: 'warningCount',
      label: '警示數',
      before: baseHealth.summary.warningCount,
      after: draftHealth.summary.warningCount,
      delta: draftHealth.summary.warningCount - baseHealth.summary.warningCount,
      direction: lowerIsBetter(
        baseHealth.summary.warningCount,
        draftHealth.summary.warningCount,
      ),
    },
    {
      key: 'readiness',
      label: '規劃就緒度',
      before: baseReadiness,
      after: draftReadiness,
      delta: draftReadiness - baseReadiness,
      direction: higherIsBetter(baseReadiness, draftReadiness),
    },
  ];

  return {
    metrics,
    hasChanges: metrics.some((m) => m.delta !== 0),
  };
}

/**
 * 比較兩份 OrgData 的高層健檢指標（純函式），供編輯態 before→after 浮層使用。
 *
 * - 重用 buildOrgHealth / buildReadiness，不重造演算法；delta 計算委派 buildHealthDelta。
 * - 簽章與輸出與既有契約完全一致（見 buildHealthDelta 的指標規則）。
 */
export function compareOrgHealth(base: OrgData, draft: OrgData): OrgHealthDelta {
  return buildHealthDelta(buildOrgHealth(base), buildOrgHealth(draft));
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
 * - depth 取每位員工主歸屬的有效層級（effectiveLevel）：預設為主匯報深度
 *   （computePrimaryDepth，根=第1層、只走主匯報），assignment.level 為手動覆寫。
 * - 職能覆蓋直接 buildFunctionCoverage(data)，並轉成 findings。
 * - 結構風險：chain（孤兒／懸空主管）、cycle（重用 validators）、spof（唯一主管）。
 */
export function buildOrgHealth(
  data: OrgData,
  options?: { wideSpanThreshold?: number },
): OrgHealth {
  const wideSpanThreshold =
    options?.wideSpanThreshold ?? DEFAULT_WIDE_SPAN_THRESHOLD;

  // depth 由主匯報深度自動計算（effectiveLevel 在缺 level 時 fall through 到
  // computePrimaryDepth）；不再 backfill level，避免舊 per-group/含虛線深度污染。
  const normalized = data;

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

  // ---- 層級深度（depth）：取每位 active 員工主歸屬的有效層級 ----
  // 預設由主匯報深度自動計算（根 = 第 1 層、每階 +1，只走主匯報、忽略虛線），
  // assignment.level 為稀疏的手動覆寫（effectiveLevel 覆寫優先）。
  const depthMap = computePrimaryDepth(normalized.assignments);
  const countByLevel = new Map<number, number>();
  for (const emp of activeEmployees) {
    const primary = primaryByEmployee.get(emp.id);
    if (!primary) continue; // 孤兒由 chain finding 涵蓋
    const level = effectiveLevel(primary, depthMap);
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
        message: `員工「${emp.name}」沒有任何組別歸屬（無任何歸屬），不在任何匯報線上。`,
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

  // ---- 組別 ↔ 主管一致性（Phase F）----
  // 重用 deriveAllGroupLeadership（leader + 推導式 co-leader）與既有 depthMap，
  // 不重造深度/領導推導。三規則皆刻意排除「合法 co-lead 平行共管」情形，避免誤報。
  const leadershipByGroup = deriveAllGroupLeadership(normalized);
  const groupById = new Map(normalized.groups.map((g) => [g.id, g]));
  const nameOf = (id: string): string => employeeById.get(id)?.name ?? id;

  // 每組成員集合（該組所有 assignment 的 employeeId），供「主管是否在組內」判定。
  const membersByGroup = new Map<string, Set<string>>();
  for (const a of normalized.assignments) {
    const set = membersByGroup.get(a.groupId) ?? new Set<string>();
    set.add(a.employeeId);
    membersByGroup.set(a.groupId, set);
  }

  // 規則 1：parallel-colead（info，合法但標示）——每組每位 co-leader 一筆，不扣分。
  for (const [groupId, leadership] of leadershipByGroup) {
    if (leadership.leaderId == null) continue;
    if (!isActive(leadership.leaderId)) continue;
    const group = groupById.get(groupId);
    if (!group) continue;
    for (const coLeaderId of leadership.coLeaderIds) {
      if (!isActive(coLeaderId)) continue;
      findings.push({
        id: `parallel-colead:${groupId}:${coLeaderId}`,
        severity: 'info',
        category: 'parallel-colead',
        message: `「${nameOf(coLeaderId)}」與組長「${nameOf(leadership.leaderId)}」平行共管「${group.name}」（同層）。`,
        employeeId: coLeaderId,
        groupId,
      });
    }
  }

  // 規則 2 & 3：對每筆 assignment（其 primarySupervisorId = s，非 null）檢查。
  // 規則 2：group-mismatch（warning）——主管 s 不在該組（非成員、非 co-leader、非 leader）。
  // 規則 3：層級異常（warning，併入 group-mismatch category）——s 在組內但部屬層級未低於 s。
  for (const a of normalized.assignments) {
    const s = a.primarySupervisorId;
    if (s == null) continue;
    if (!isActive(a.employeeId) || !isActive(s)) continue;
    const group = groupById.get(a.groupId);
    if (!group || group.status !== 'active') continue;
    const leadership = leadershipByGroup.get(a.groupId);
    const members = membersByGroup.get(a.groupId);
    const sInGroup = members?.has(s) ?? false;
    const sIsLeader = leadership?.leaderId === s;
    const sIsCoLeader = leadership?.coLeaderIds.includes(s) ?? false;

    if (!sInGroup) {
      // 規則 2：主管在組外。排除合法 co-lead（s 為本組推導 co-leader）與 leader，
      // 並對稱排除「成員本人即本組組長」——組長往上的組外上級主管是正常上行階層，不算掛錯組。
      if (sIsCoLeader || sIsLeader || leadership?.leaderId === a.employeeId) continue;
      findings.push({
        id: `group-mismatch:${a.groupId}:${a.employeeId}`,
        severity: 'warning',
        category: 'group-mismatch',
        message: `「${nameOf(a.employeeId)}」的主管「${nameOf(s)}」不屬於「${group.name}」組。`,
        employeeId: a.employeeId,
        groupId: a.groupId,
      });
      continue;
    }

    // 規則 3：s 在組內。排除合法 co-lead 平行同層情形（成員或 s 為本組 co-leader）。
    if (sIsCoLeader || leadership?.coLeaderIds.includes(a.employeeId)) continue;
    // 成員與主管皆用 effectiveLevel（覆寫優先、否則主匯報深度）求層級，對稱比較。
    // 兩側皆以其主歸屬 assignment 求 effectiveLevel；缺主歸屬則回退全公司 depthMap。
    const memberPrimary = primaryByEmployee.get(a.employeeId);
    const memberLevel = memberPrimary
      ? effectiveLevel(memberPrimary, depthMap)
      : depthMap.get(a.employeeId);
    const supPrimary = primaryByEmployee.get(s);
    const supLevel = supPrimary
      ? effectiveLevel(supPrimary, depthMap)
      : depthMap.get(s);
    if (supLevel != null && memberLevel != null && memberLevel <= supLevel) {
      findings.push({
        id: `level-anomaly:${a.groupId}:${a.employeeId}`,
        severity: 'warning',
        category: 'group-mismatch',
        message: `「${nameOf(a.employeeId)}」與主管「${nameOf(s)}」層級異常（部屬未低於主管）。`,
        employeeId: a.employeeId,
        groupId: a.groupId,
      });
    }
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
