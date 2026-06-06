import type { OrgData } from '../types/org';

/**
 * 規劃旅程 6 步固定順序：載入 → 編輯 → 健檢 → 比較 → 影響 → 發布。
 * 對應契約 docs/契約-整合UX收尾.md §3。
 */
export type OverviewStepKey =
  | 'load'
  | 'edit'
  | 'health'
  | 'compare'
  | 'impact'
  | 'publish';

export interface OverviewStep {
  key: OverviewStepKey;
  /** 步驟名稱（繁中）。 */
  label: string;
  /** 一句話說明（繁中）。 */
  description: string;
  /** 對應路由。 */
  to: string;
  /**
   * 狀態：done=已完成、ready=可開始。
   * v1 簡化為兩態；「沒資料」情境下，UI 自行把後續步驟視覺淡化。
   */
  status: 'done' | 'ready';
}

export interface OverviewRecommendation {
  /** 推薦的下一步（旅程中某一步）；若無資料推薦從 load 開始。 */
  nextStep: OverviewStepKey;
  /** 給使用者看的繁中說明。 */
  message: string;
  /** 點擊後跳到的路由。 */
  to: string;
}

export interface OverviewStats {
  activeEmployees: number;
  departments: number;
  functions: number;
  publishedVersions: number;
  processes: number;
}

export interface OverviewStatus {
  /** 固定 6 步順序：load → edit → health → compare → impact → publish。 */
  steps: OverviewStep[];
  recommendation: OverviewRecommendation;
  stats: OverviewStats;
}

export interface BuildOverviewStatusArgs {
  data: OrgData;
  publishedVersionsCount: number;
  processesCount: number;
  impactBaselineSet: boolean;
}

interface StepMeta {
  key: OverviewStepKey;
  label: string;
  description: string;
  to: string;
}

/**
 * 6 步固定順序與文案（label/description 為繁中、簡短）。
 * label/description 由前端在契約允許範圍內挑定，供 QA 寫測試對齊。
 */
const STEP_META: readonly StepMeta[] = [
  {
    key: 'load',
    label: '載入現況',
    description: '匯入 CSV/Excel 或選擇內建範本作為基礎組織資料',
    to: '/csv-import',
  },
  {
    key: 'edit',
    label: '編輯人員與組別',
    description: '維護員工歸屬、主管關係與組別結構',
    to: '/people',
  },
  {
    key: 'health',
    label: '規劃健檢',
    description: '檢查管理幅度、層級深度與職能缺口',
    to: '/health',
  },
  {
    key: 'compare',
    label: '情境比較',
    description: '建立多個版本，比對 diff 與關鍵指標',
    to: '/compare',
  },
  {
    key: 'impact',
    label: '變更影響',
    description: '設定基準後，看組織調整動到哪些流程核准人',
    to: '/bpmn/impact',
  },
  {
    key: 'publish',
    label: '發布版本',
    description: '把目前草稿發布為一個可比對、可回放的版本',
    to: '/people',
  },
];

function activeEmployeeCount(data: OrgData): number {
  return data.employees.filter((e) => e.status === 'active').length;
}

function activeGroupCountByKind(
  data: OrgData,
  kind: 'department' | 'function',
): number {
  return data.groups.filter((g) => g.status === 'active' && g.kind === kind)
    .length;
}

function buildStats(
  args: BuildOverviewStatusArgs,
): OverviewStats {
  const { data, publishedVersionsCount, processesCount } = args;
  return {
    activeEmployees: activeEmployeeCount(data),
    departments: activeGroupCountByKind(data, 'department'),
    functions: activeGroupCountByKind(data, 'function'),
    publishedVersions: publishedVersionsCount,
    processes: processesCount,
  };
}

function statusFor(
  key: OverviewStepKey,
  stats: OverviewStats,
  impactBaselineSet: boolean,
): 'done' | 'ready' {
  const hasData = stats.activeEmployees > 0;
  switch (key) {
    case 'load':
      return hasData ? 'done' : 'ready';
    case 'edit':
      return hasData ? 'done' : 'ready';
    case 'health':
      // 健檢無「完成」概念，v1 永遠 ready。
      return 'ready';
    case 'compare':
      return stats.publishedVersions >= 2 ? 'done' : 'ready';
    case 'impact':
      return impactBaselineSet ? 'done' : 'ready';
    case 'publish':
      return stats.publishedVersions > 0 ? 'done' : 'ready';
  }
}

function buildSteps(
  stats: OverviewStats,
  impactBaselineSet: boolean,
): OverviewStep[] {
  return STEP_META.map((meta) => ({
    ...meta,
    status: statusFor(meta.key, stats, impactBaselineSet),
  }));
}

const STEP_TO_ROUTE: Record<OverviewStepKey, string> = STEP_META.reduce(
  (acc, meta) => {
    acc[meta.key] = meta.to;
    return acc;
  },
  {} as Record<OverviewStepKey, string>,
);

function buildRecommendation(
  stats: OverviewStats,
  impactBaselineSet: boolean,
): OverviewRecommendation {
  // 推薦邏輯：由上往下第一個命中（契約 §3）。
  if (stats.activeEmployees === 0) {
    return {
      nextStep: 'load',
      message: '先匯入 CSV/Excel 或載入內建範本，把現況資料準備好',
      to: STEP_TO_ROUTE.load,
    };
  }
  if (stats.publishedVersions === 0) {
    return {
      nextStep: 'health',
      message: '資料已就緒，建議先看「規劃健檢」確認結構',
      to: STEP_TO_ROUTE.health,
    };
  }
  if (stats.publishedVersions === 1) {
    return {
      nextStep: 'compare',
      message: '想試另一個方案？先建第二個版本，再用「情境比較」比 diff 與指標',
      to: STEP_TO_ROUTE.compare,
    };
  }
  if (
    stats.publishedVersions >= 2 &&
    stats.processes > 0 &&
    !impactBaselineSet
  ) {
    return {
      nextStep: 'impact',
      message: '設定基準快照，看組織調整動到哪些流程',
      to: STEP_TO_ROUTE.impact,
    };
  }
  return {
    nextStep: 'health',
    message: '繼續優化結構或開新方案',
    to: STEP_TO_ROUTE.health,
  };
}

/**
 * 從目前資料狀態計算「總覽頁」所需的旅程步驟、推薦與統計。
 * 純函式，無副作用；UI 直接綁定回傳結果即可。
 */
export function buildOverviewStatus(
  args: BuildOverviewStatusArgs,
): OverviewStatus {
  const stats = buildStats(args);
  const steps = buildSteps(stats, args.impactBaselineSet);
  const recommendation = buildRecommendation(stats, args.impactBaselineSet);
  return { steps, recommendation, stats };
}
