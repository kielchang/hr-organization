import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { GroupMembershipFlowChart } from './GroupMembershipFlowChart';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildGroupMembershipGraph';
import { assignment, emp, group, jobLevel, makeOrgData } from '../../test/fixtures';
import type { GroupKind, OrgData } from '../../types/org';

/**
 * GroupMembershipFlowChart（組別歸屬圖）元件測試。
 *
 * 受測變更：詳情卡（OrgDetailPanel）的顯示條件由「只看 selectedEmployeeId 非空」
 * 改為 hasDetail＝「selectedEmployeeId 非空 **且** 該員工確實存在於當前 membership
 * 節點集合（computedNodes）」。意圖：跨視角共用 selectedEmployeeId、或被 kindFilter
 * 濾掉時，那人不在當前節點集合 → 不再殘留「圖上無對應節點」的詳情卡。
 *
 * 斷言策略（避開 React Flow jsdom 限制 + 節點/卡片同名干擾）：
 * - 詳情卡 OrgDetailPanel 並非 React Flow 節點，而是渲染在 Panel（top-left）內的
 *   一般 DOM，且其根容器帶唯一 class `.org-detail-panel`，jsdom 下可穩定查得，
 *   不受 RF 對節點 wrapper 設 visibility:hidden 的查詢限制影響。
 * - 注意：被選員工的姓名/工號同時出現在「圖上的成員節點（AssignmentMemberNode）」
 *   與「詳情卡」中，故不能僅以全域 getByText(姓名) 判定卡片是否顯示（會誤命中節點）。
 *   因此以 `.org-detail-panel` 容器存在與否作為「詳情卡是否顯示」的穩定 proxy，
 *   並以 within(panel) 將姓名/工號斷言侷限在卡片內。
 * - 為與「OrgDetailPanel 自身 `if (!employee) return null` 的內建守門」區隔，
 *   「不顯示」案例皆選用「員工確實存在於 orgData、但不在當前節點集合」的情境
 *   （被 kindFilter 濾掉 / 屬於另一視角），藉此真正驗證受測的 hasDetail 閘門，
 *   而非 panel 自身的查無員工守門。
 *
 * 資料注入：GroupMembershipFlowChart 內部以 useOrg() 取 data（非由 prop 傳入），
 * 故以 OrgProvider 的版本契約注入固定 fixture：將 active 版本設為內建 seed id
 * 'org-data'、並寫入屬於該版本的 draft（draftBelongsToActive → 載入 draft 為 data）。
 * setup.ts 的 afterEach 會 localStorage.clear()，故每次 render 前重新 seed。
 */

const SEED_VERSION_ID = 'org-data';

beforeAll(() => {
  // React Flow 掛載時建立 ResizeObserver 量測容器，jsdom 未提供 → 最小 stub。
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/** 以 OrgProvider 的版本契約把 fixture 注入為 provider 的 data。 */
function seedProvider(data: OrgData) {
  localStorage.setItem('hr-org-active-version', SEED_VERSION_ID);
  localStorage.setItem('hr-org-draft', JSON.stringify(data));
}

/**
 * 混合 kind 的 fixture：
 * - dept（部門）：含 dAlice（工號 D-ALICE）。
 * - fn（職能）：含 fBob（工號 F-BOB）。
 * 兩員工各只屬一個 kind 的組 → 用 kindFilter 即可讓某員工「在/不在」當前節點集合。
 */
function mixedOrg(): OrgData {
  return makeOrgData({
    employees: [
      emp('dAlice', { name: '部門愛麗絲', employeeNo: 'D-ALICE' }),
      emp('fBob', { name: '職能巴布', employeeNo: 'F-BOB' }),
    ],
    groups: [
      group('dept', { name: '業務部', kind: 'department' }),
      group('fn', { name: '品保職能', kind: 'function' }),
    ],
    jobLevels: [jobLevel('j1', 40, { name: '經理' })],
    assignments: [
      assignment('a-dAlice', { employeeId: 'dAlice', groupId: 'dept', jobLevelId: 'j1' }),
      assignment('a-fBob', { employeeId: 'fBob', groupId: 'fn', jobLevelId: 'j1' }),
    ],
  });
}

function renderChart(props?: {
  orgData?: OrgData;
  selectedGroupId?: string;
  selectedEmployeeId?: string | null;
  kindFilter?: GroupKind;
}) {
  seedProvider(props?.orgData ?? mixedOrg());
  return renderWithProviders(
    <GroupMembershipFlowChart
      variant="membership"
      selectedGroupId={props?.selectedGroupId ?? ALL_GROUPS_VIEW_ID}
      onGroupChange={vi.fn()}
      selectedEmployeeId={props?.selectedEmployeeId ?? null}
      onNodeSelect={vi.fn()}
      kindFilter={props?.kindFilter}
    />,
  );
}

/** 詳情卡（OrgDetailPanel）根容器，未顯示則回傳 null。 */
function detailPanel(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.org-detail-panel');
}

/** 詳情卡是否顯示：以唯一根容器 `.org-detail-panel` 存在與否判定。 */
function detailPanelShown(container: HTMLElement): boolean {
  return detailPanel(container) != null;
}

describe('GroupMembershipFlowChart 詳情卡顯示閘門（hasDetail）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('render smoke：React Flow 容器掛載、無 console.error', () => {
    const { container } = renderChart();
    expect(container.querySelector('.react-flow')).not.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('案例1 選取者存在於當前節點集合 → 詳情卡顯示（卡內含其姓名＋工號）', () => {
    // 全公司視角、不過濾 → dAlice 在當前 membership 節點集合中。
    const { container } = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: 'dAlice',
    });
    const panel = detailPanel(container);
    expect(panel).not.toBeNull();
    // 卡片內（而非圖上節點）含被選員工的姓名與工號。
    expect(within(panel!).getByText('部門愛麗絲')).toBeInTheDocument();
    expect(within(panel!).getByText('D-ALICE')).toBeInTheDocument();
    // 卡片標題區塊（組別歸屬）佐證確為 OrgDetailPanel。
    expect(within(panel!).getByText('組別歸屬')).toBeInTheDocument();
  });

  it('案例2 選取者不在當前節點集合（屬另一 kind 的組）→ 詳情卡不顯示', () => {
    // kindFilter='department' → 當前只剩 dept 節點；fBob 只屬 fn 組 → 不在節點集合。
    // fBob 仍存在於 orgData（非 panel 自身查無員工守門），驗證的是 hasDetail 閘門。
    const { container } = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: 'fBob',
      kindFilter: 'department',
    });
    expect(detailPanelShown(container)).toBe(false);
    // 全域亦不應出現 fBob 的工號（卡片與節點皆無 → fBob 既未入卡也不在 dept 節點集合）。
    expect(screen.queryByText('F-BOB')).not.toBeInTheDocument();
  });

  it('案例2b 選取者為完全不存在的 id → 詳情卡不顯示', () => {
    const { container } = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: 'ghost-employee',
    });
    // 既不在節點集合、orgData 亦無此人 → 卡片不出現。
    expect(detailPanelShown(container)).toBe(false);
  });

  it('案例3 kindFilter 濾掉選取者所在叢集 → 詳情卡消失', () => {
    // 選 fBob（職能）後，將 kindFilter 設為 'department' 把 fn 叢集濾掉 →
    // fBob 不再在節點集合 → 詳情卡不顯示。
    const filteredOut = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: 'fBob',
      kindFilter: 'department',
    });
    expect(detailPanelShown(filteredOut.container)).toBe(false);
    filteredOut.unmount();

    // 對照：同一選取者在 kindFilter='function'（其所在 kind）下 → 詳情卡顯示。
    const reEnabled = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: 'fBob',
      kindFilter: 'function',
    });
    const panel = detailPanel(reEnabled.container);
    expect(panel).not.toBeNull();
    expect(within(panel!).getByText('F-BOB')).toBeInTheDocument();
  });

  it('案例4 selectedEmployeeId = null → 詳情卡不顯示', () => {
    const { container } = renderChart({
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      selectedEmployeeId: null,
    });
    expect(detailPanelShown(container)).toBe(false);
  });

  it('回歸對照：選取者隨 kindFilter 進出節點集合，詳情卡與閘門一致', () => {
    // 同一 selectedEmployeeId='dAlice'：
    // - kindFilter='department' → dAlice 在 → 顯示。
    const inView = renderChart({
      selectedEmployeeId: 'dAlice',
      kindFilter: 'department',
    });
    expect(detailPanelShown(inView.container)).toBe(true);
    inView.unmount();

    // - kindFilter='function' → dAlice 被濾掉、不在 → 不顯示。
    const outOfView = renderChart({
      selectedEmployeeId: 'dAlice',
      kindFilter: 'function',
    });
    expect(detailPanelShown(outOfView.container)).toBe(false);
  });
});
