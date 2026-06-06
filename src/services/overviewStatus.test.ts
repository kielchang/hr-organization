import { describe, it, expect } from 'vitest';
import {
  buildOverviewStatus,
  type BuildOverviewStatusArgs,
  type OverviewStepKey,
} from './overviewStatus';
import type {
  Assignment,
  Employee,
  Group,
  OrgData,
} from '../types/org';

/**
 * 單元測試：services/overviewStatus.ts
 * 對應契約 docs/契約-整合UX收尾.md §3。
 * - 6 步固定順序、label/description/to 對齊 FE 提供的清單
 * - 推薦邏輯 5 條規則由上往下第一個命中
 * - done 判定：load/edit/compare/impact/publish 條件，health 永遠 ready
 * - stats 5 個數字計數
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

function employee(id: string, status: 'active' | 'inactive' = 'active'): Employee {
  return { id, employeeNo: id.toUpperCase(), name: `員工${id}`, status };
}

function group(
  id: string,
  kind: 'department' | 'function',
  status: 'active' | 'inactive' = 'active',
): Group {
  return {
    id,
    code: id.toUpperCase(),
    name: `組別${id}`,
    parentId: null,
    status,
    kind,
  };
}

function emptyData(): OrgData {
  return {
    schemaVersion: 2,
    contentVersion: 1,
    exportedAt: '2026-06-06T00:00:00+08:00',
    employees: [],
    groups: [],
    jobLevels: [],
    assignments: [] as Assignment[],
    changeLog: [],
  };
}

function dataWithEmployees(activeCount: number, inactiveCount = 0): OrgData {
  const d = emptyData();
  for (let i = 0; i < activeCount; i++) d.employees.push(employee(`a${i}`, 'active'));
  for (let i = 0; i < inactiveCount; i++) d.employees.push(employee(`x${i}`, 'inactive'));
  return d;
}

function defaultArgs(overrides: Partial<BuildOverviewStatusArgs> = {}): BuildOverviewStatusArgs {
  return {
    data: emptyData(),
    publishedVersionsCount: 0,
    processesCount: 0,
    impactBaselineSet: false,
    ...overrides,
  };
}

// ─── 6 步固定順序與文案 ───────────────────────────────────────────────────────

describe('buildOverviewStatus — 6 步固定順序與文案', () => {
  it('回傳 6 個步驟，順序為 load → edit → health → compare → impact → publish', () => {
    const { steps } = buildOverviewStatus(defaultArgs());
    expect(steps.map((s) => s.key)).toEqual<OverviewStepKey[]>([
      'load',
      'edit',
      'health',
      'compare',
      'impact',
      'publish',
    ]);
  });

  it('每步 label / description / to 與 FE 提供的清單一致', () => {
    const { steps } = buildOverviewStatus(defaultArgs());
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<
      OverviewStepKey,
      (typeof steps)[number]
    >;

    expect(byKey.load.label).toBe('載入現況');
    expect(byKey.load.description).toBe('匯入 CSV/Excel 或選擇內建範本作為基礎組織資料');
    expect(byKey.load.to).toBe('/csv-import');

    expect(byKey.edit.label).toBe('編輯人員與組別');
    expect(byKey.edit.description).toBe('維護員工歸屬、主管關係與組別結構');
    expect(byKey.edit.to).toBe('/people');

    expect(byKey.health.label).toBe('規劃健檢');
    expect(byKey.health.description).toBe('檢查管理幅度、層級深度與職能缺口');
    expect(byKey.health.to).toBe('/health');

    expect(byKey.compare.label).toBe('情境比較');
    expect(byKey.compare.description).toBe('建立多個版本，比對 diff 與關鍵指標');
    expect(byKey.compare.to).toBe('/compare');

    expect(byKey.impact.label).toBe('變更影響');
    expect(byKey.impact.description).toBe('設定基準後，看組織調整動到哪些流程核准人');
    expect(byKey.impact.to).toBe('/bpmn/impact');

    expect(byKey.publish.label).toBe('發布版本');
    expect(byKey.publish.description).toBe('把目前草稿發布為一個可比對、可回放的版本');
    expect(byKey.publish.to).toBe('/people');
  });
});

// ─── 推薦邏輯 5 條規則 ────────────────────────────────────────────────────────

describe('buildOverviewStatus — 推薦邏輯（由上往下第一個命中）', () => {
  it('規則 1：activeEmployees === 0 → 推薦 load → /csv-import', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        // 即使有別的條件干擾，只要沒有 active 員工，仍走 load
        publishedVersionsCount: 5,
        processesCount: 9,
        impactBaselineSet: true,
      }),
    );
    expect(recommendation.nextStep).toBe('load');
    expect(recommendation.to).toBe('/csv-import');
    expect(typeof recommendation.message).toBe('string');
    expect(recommendation.message.length).toBeGreaterThan(0);
  });

  it('規則 2：有 active 員工但 publishedVersionsCount === 0 → 推薦 health → /health', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        data: dataWithEmployees(3),
        publishedVersionsCount: 0,
      }),
    );
    expect(recommendation.nextStep).toBe('health');
    expect(recommendation.to).toBe('/health');
  });

  it('規則 3：publishedVersionsCount === 1 → 推薦 compare → /compare', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        data: dataWithEmployees(3),
        publishedVersionsCount: 1,
      }),
    );
    expect(recommendation.nextStep).toBe('compare');
    expect(recommendation.to).toBe('/compare');
  });

  it('規則 4：publishedVersionsCount >= 2 且 processesCount > 0 且 !impactBaselineSet → 推薦 impact → /bpmn/impact', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        data: dataWithEmployees(3),
        publishedVersionsCount: 2,
        processesCount: 1,
        impactBaselineSet: false,
      }),
    );
    expect(recommendation.nextStep).toBe('impact');
    expect(recommendation.to).toBe('/bpmn/impact');
  });

  it('規則 5 fallthrough：publishedVersionsCount >= 2 但 impactBaselineSet=true → 預設推薦 health', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        data: dataWithEmployees(3),
        publishedVersionsCount: 2,
        processesCount: 1,
        impactBaselineSet: true,
      }),
    );
    expect(recommendation.nextStep).toBe('health');
    expect(recommendation.to).toBe('/health');
  });

  it('規則 5 fallthrough：publishedVersionsCount >= 2 但無 processes → 預設推薦 health', () => {
    const { recommendation } = buildOverviewStatus(
      defaultArgs({
        data: dataWithEmployees(3),
        publishedVersionsCount: 3,
        processesCount: 0,
        impactBaselineSet: false,
      }),
    );
    expect(recommendation.nextStep).toBe('health');
    expect(recommendation.to).toBe('/health');
  });
});

// ─── done 判定 ────────────────────────────────────────────────────────────────

describe('buildOverviewStatus — done 判定', () => {
  function stepStatus(args: BuildOverviewStatusArgs) {
    const { steps } = buildOverviewStatus(args);
    return Object.fromEntries(steps.map((s) => [s.key, s.status])) as Record<
      OverviewStepKey,
      'done' | 'ready'
    >;
  }

  it('全空狀態：所有步驟皆 ready（health 永遠 ready）', () => {
    const s = stepStatus(defaultArgs());
    expect(s.load).toBe('ready');
    expect(s.edit).toBe('ready');
    expect(s.health).toBe('ready');
    expect(s.compare).toBe('ready');
    expect(s.impact).toBe('ready');
    expect(s.publish).toBe('ready');
  });

  it('有 active 員工 → load 與 edit 為 done', () => {
    const s = stepStatus(defaultArgs({ data: dataWithEmployees(1) }));
    expect(s.load).toBe('done');
    expect(s.edit).toBe('done');
  });

  it('inactive 員工不計入 load/edit 完成度', () => {
    const s = stepStatus(defaultArgs({ data: dataWithEmployees(0, 5) }));
    expect(s.load).toBe('ready');
    expect(s.edit).toBe('ready');
  });

  it('publishedVersionsCount === 1 → publish 為 done、compare 仍 ready', () => {
    const s = stepStatus(
      defaultArgs({ data: dataWithEmployees(2), publishedVersionsCount: 1 }),
    );
    expect(s.publish).toBe('done');
    expect(s.compare).toBe('ready');
  });

  it('publishedVersionsCount >= 2 → compare 與 publish 皆為 done', () => {
    const s = stepStatus(
      defaultArgs({ data: dataWithEmployees(2), publishedVersionsCount: 2 }),
    );
    expect(s.compare).toBe('done');
    expect(s.publish).toBe('done');
  });

  it('impactBaselineSet === true → impact 為 done', () => {
    const s = stepStatus(defaultArgs({ impactBaselineSet: true }));
    expect(s.impact).toBe('done');
  });

  it('impactBaselineSet === false → impact 為 ready', () => {
    const s = stepStatus(defaultArgs({ impactBaselineSet: false }));
    expect(s.impact).toBe('ready');
  });

  it('health 永遠 ready（即使所有其他條件齊備）', () => {
    const s = stepStatus(
      defaultArgs({
        data: dataWithEmployees(10),
        publishedVersionsCount: 5,
        processesCount: 3,
        impactBaselineSet: true,
      }),
    );
    expect(s.health).toBe('ready');
  });
});

// ─── stats 計數 ───────────────────────────────────────────────────────────────

describe('buildOverviewStatus — stats 5 個數字', () => {
  it('全空狀態 → 全為 0', () => {
    const { stats } = buildOverviewStatus(defaultArgs());
    expect(stats).toEqual({
      activeEmployees: 0,
      departments: 0,
      functions: 0,
      publishedVersions: 0,
      processes: 0,
    });
  });

  it('activeEmployees 只計入 status=active', () => {
    const { stats } = buildOverviewStatus(
      defaultArgs({ data: dataWithEmployees(3, 2) }),
    );
    expect(stats.activeEmployees).toBe(3);
  });

  it('departments 與 functions 分開計數（皆需 status=active）', () => {
    const data = emptyData();
    data.groups.push(
      group('d1', 'department', 'active'),
      group('d2', 'department', 'active'),
      group('d3', 'department', 'inactive'),
      group('f1', 'function', 'active'),
      group('f2', 'function', 'inactive'),
    );
    const { stats } = buildOverviewStatus(defaultArgs({ data }));
    expect(stats.departments).toBe(2);
    expect(stats.functions).toBe(1);
  });

  it('publishedVersions 與 processes 直接透傳 args', () => {
    const { stats } = buildOverviewStatus(
      defaultArgs({
        publishedVersionsCount: 4,
        processesCount: 7,
      }),
    );
    expect(stats.publishedVersions).toBe(4);
    expect(stats.processes).toBe(7);
  });
});
