import type { OrgData } from '../types/org';
import type { OrgDiffResult } from '../types/editSession';
import { backfillAssignmentLevels } from './assignmentLevels';
import { computeOrgDiff } from './computeOrgDiff';
import { buildOrgHealth, type OrgHealth } from './orgHealth';

/**
 * 規劃情境比較（what-if）服務 — 純函式。
 *
 * 對齊「介面契約 — 規劃情境比較」（docs/契約-情境比較whatif.md §2）：
 * - 多版本（情境）對齊到同一份輸出格式
 * - 重用 `computeOrgDiff` 算結構差異、`buildOrgHealth` 算規劃指標
 * - 不新增資料模型、不動 server
 *
 * UI 只負責呈現；任何顯示決策（顏色、排版）由 ScenarioComparePage 處理。
 */

/** 一個情境（要比較的方案）：含取得來源的 versionId + 顯示用 label + 攤平的 OrgData */
export interface ScenarioInput {
  /** 版本識別（與既有版本下拉同源）。 */
  versionId: string;
  /** 顯示名稱（建議帶版本與來源前綴，已在 dataVersions 處理）。 */
  label: string;
  /** 已 migrate（並可選 backfillAssignmentLevels）完的整包資料。 */
  data: OrgData;
}

/** 一個情境的計算結果：對「基準情境」的 diff + 自己的健檢 */
export interface ScenarioResult {
  input: ScenarioInput;
  health: OrgHealth;
  /** 與「基準情境」（陣列第一個）的 diff；基準自己 diff 為空。 */
  diffVsBaseline: OrgDiffResult;
  /** diff 摘要計數（供卡片顯示，不必算重）。 */
  diffSummary: {
    addedEmployees: number;
    removedEmployees: number;
    modifiedEmployees: number;
    addedAssignments: number;
    removedAssignments: number;
    modifiedAssignments: number;
    addedEdges: number;
    removedEdges: number;
  };
}

/** 程式用指標 id，對齊契約 §2 `metricMatrix` 列順序。 */
export type MetricKey =
  | 'activeEmployees'
  | 'departments'
  | 'functions'
  | 'supervisors'
  | 'avgSpan'
  | 'maxDepth'
  | 'warningCount'
  | 'functionsWithoutMembers'
  | 'functionsWithoutLead'
  | 'spofCount';

export interface ScenarioComparison {
  /** 順序＝輸入順序，第一個為基準。 */
  scenarios: ScenarioResult[];
  /** 指標對照矩陣：每行一個指標、每欄一個情境，便於 UI 渲染。 */
  metricMatrix: {
    /** 指標名稱（繁中）。 */
    label: string;
    key: MetricKey;
    /** 與 scenarios 同序。 */
    values: (number | string)[];
    /** 對於該指標，數字越大越好(↑)、越小越好(↓)、或中性(=)。 */
    direction: 'up' | 'down' | 'neutral';
  }[];
}

/** 空 diff（基準對自己；以及 0/1 情境的安全預設）。 */
function emptyDiff(): OrgDiffResult {
  return {
    addedEmployeeIds: new Set<string>(),
    removedEmployeeIds: new Set<string>(),
    modifiedEmployeeIds: new Set<string>(),
    addedAssignmentIds: new Set<string>(),
    removedAssignmentIds: new Set<string>(),
    modifiedAssignmentIds: new Set<string>(),
    assignmentChangedEmployeeIds: new Set<string>(),
    addedEdgeKeys: new Set<string>(),
    removedEdgeKeys: new Set<string>(),
  };
}

function summarizeDiff(diff: OrgDiffResult): ScenarioResult['diffSummary'] {
  return {
    addedEmployees: diff.addedEmployeeIds.size,
    removedEmployees: diff.removedEmployeeIds.size,
    modifiedEmployees: diff.modifiedEmployeeIds.size,
    addedAssignments: diff.addedAssignmentIds.size,
    removedAssignments: diff.removedAssignmentIds.size,
    modifiedAssignments: diff.modifiedAssignmentIds.size,
    addedEdges: diff.addedEdgeKeys.size,
    removedEdges: diff.removedEdgeKeys.size,
  };
}

/**
 * 計算單一指標在各情境的值序列。spofCount 由 findings 推導。
 */
function metricValues(
  results: ScenarioResult[],
  key: MetricKey,
): (number | string)[] {
  return results.map((r) => {
    const h = r.health;
    switch (key) {
      case 'activeEmployees':
        return h.summary.activeEmployees;
      case 'departments':
        return h.summary.departments;
      case 'functions':
        return h.summary.functions;
      case 'supervisors':
        return h.summary.supervisors;
      case 'avgSpan':
        // 保留一位小數的字串，避免欄寬抖動且與既有摘要一致。
        return h.summary.avgSpan.toFixed(1);
      case 'maxDepth':
        return h.summary.maxDepth;
      case 'warningCount':
        return h.summary.warningCount;
      case 'functionsWithoutMembers':
        return h.functionCoverage.functionsWithoutMembers.length;
      case 'functionsWithoutLead':
        return h.functionCoverage.functionsWithoutLead.length;
      case 'spofCount':
        return h.findings.filter((f) => f.category === 'spof').length;
    }
  });
}

/**
 * 指標表規格：固定順序與 direction，對齊契約 §2.語意定義。
 * direction='down' 才有「最大值警示／最小值正向」的著色語意；
 * 其餘標 neutral 避免暗示判斷（avgSpan / maxDepth 過大過小都不好；
 * activeEmployees 等量體指標屬中性偏好）。
 */
const METRIC_SPEC: ReadonlyArray<{
  key: MetricKey;
  label: string;
  direction: 'up' | 'down' | 'neutral';
}> = [
  { key: 'activeEmployees', label: '在職人數', direction: 'neutral' },
  { key: 'departments', label: '部門數', direction: 'neutral' },
  { key: 'functions', label: '職能數', direction: 'neutral' },
  { key: 'supervisors', label: '主管數', direction: 'neutral' },
  { key: 'avgSpan', label: '平均管理幅度', direction: 'neutral' },
  { key: 'maxDepth', label: '最大層級深度', direction: 'neutral' },
  { key: 'warningCount', label: '警示數', direction: 'down' },
  { key: 'functionsWithoutMembers', label: '無成員職能數', direction: 'down' },
  { key: 'functionsWithoutLead', label: '無 lead 職能數', direction: 'down' },
  { key: 'spofCount', label: '單點風險（SPOF）數', direction: 'down' },
];

/**
 * 由多個情境輸入推導比較結果（純函式）。
 *
 * - 基準（baseline）＝陣列第一個情境。
 * - 其他情境的 `diffVsBaseline` 以「基準為 base、自己為 current」呼叫 `computeOrgDiff`。
 * - 0 個情境：回傳 `{ scenarios: [], metricMatrix: [] }`。
 * - 1 個情境：基準自己（不報錯，metricMatrix 仍可呈現單欄）。
 * - 服務不設情境數上限；UI 建議 ≤4。
 */
export function buildScenarioComparison(
  inputs: ScenarioInput[],
): ScenarioComparison {
  if (inputs.length === 0) {
    return { scenarios: [], metricMatrix: [] };
  }

  // 對齊其他頁面：入口統一做 backfillAssignmentLevels（idempotent）。
  // 確保 buildOrgHealth 與 computeOrgDiff 都拿到 normalized 後的 OrgData，
  // 避免直接呼叫此 service 並傳入未 backfill 資料時，diff 把 level 變動誤判。
  const normalizedInputs: ScenarioInput[] = inputs.map((input) => ({
    ...input,
    data: backfillAssignmentLevels(input.data),
  }));

  const baseline = normalizedInputs[0];
  const scenarios: ScenarioResult[] = normalizedInputs.map((input, index) => {
    const diffVsBaseline =
      index === 0 ? emptyDiff() : computeOrgDiff(baseline.data, input.data);
    return {
      input,
      health: buildOrgHealth(input.data),
      diffVsBaseline,
      diffSummary: summarizeDiff(diffVsBaseline),
    };
  });

  const metricMatrix = METRIC_SPEC.map(({ key, label, direction }) => ({
    key,
    label,
    direction,
    values: metricValues(scenarios, key),
  }));

  return { scenarios, metricMatrix };
}
