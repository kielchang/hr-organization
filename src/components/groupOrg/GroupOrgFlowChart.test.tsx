import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GroupOrgFlowChart } from './GroupOrgFlowChart';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildGroupOrgGraph';
import { computeOrgDiff } from '../../services/computeOrgDiff';
import { assignment, emp, group, jobLevel, makeOrgData } from '../../test/fixtures';
import type { OrgData } from '../../types/org';

/**
 * GroupOrgFlowChart（D2，唯讀組別組織圖）元件測試。
 *
 * 比照 OrgChartPage/ReportingEditCanvas 既有測試風格：React Flow（@xyflow/react）
 * 掛載需 ResizeObserver，jsdom 未提供 → 最小 stub。React Flow 在 jsdom 仍會渲染
 * 節點本體（已驗證），故可斷言組框標題/成員姓名等內容。
 *
 * 覆蓋：render smoke、唯讀契約（無編輯工具列、節點不可拖）、groupZone 背景分區
 * 角落標籤顯示組名＋組長/共管、姓名回退（leaderId null → 未指定）、無 console.error。
 *
 * 重設計：群組以 `groupZone` 背景分區呈現（取代舊 groupBox 容器框）→ 節點 class 為
 * `.react-flow__node-groupZone`；分區 aria-label 為「組別分區 …（組長：…）」。
 */
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/** boss(g1,leaderId) ← mid(g1)；g2 為另一 active 組（測 ALL 視角多框）。 */
function seedOrg(): OrgData {
  return makeOrgData({
    employees: [
      emp('boss', { name: '老闆' }),
      emp('mid', { name: '中階' }),
      emp('alice', { name: '愛麗絲' }),
    ],
    groups: [
      group('g1', { name: '業務部', leaderId: 'boss' }),
      group('g2', { name: '工程部' }),
    ],
    jobLevels: [jobLevel('j1', 40, { name: '經理' })],
    assignments: [
      assignment('a-boss', { employeeId: 'boss', groupId: 'g1', jobLevelId: 'j1' }),
      assignment('a-mid', {
        employeeId: 'mid',
        groupId: 'g1',
        jobLevelId: 'j1',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
      }),
      assignment('a-alice', { employeeId: 'alice', groupId: 'g2', jobLevelId: 'j1' }),
    ],
  });
}

function renderChart(props?: {
  orgData?: OrgData;
  selectedGroupId?: string;
  onGroupChange?: (id: string) => void;
  selectedEmployeeId?: string | null;
  onNodeSelect?: (id: string | null) => void;
  diffResult?: import('../../types/editSession').OrgDiffResult | null;
}) {
  return render(
    <GroupOrgFlowChart
      orgData={props?.orgData ?? seedOrg()}
      selectedGroupId={props?.selectedGroupId ?? ALL_GROUPS_VIEW_ID}
      onGroupChange={props?.onGroupChange ?? vi.fn()}
      selectedEmployeeId={props?.selectedEmployeeId ?? null}
      onNodeSelect={props?.onNodeSelect ?? vi.fn()}
      diffResult={props?.diffResult}
    />,
  );
}

describe('GroupOrgFlowChart 唯讀組別組織圖', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('render smoke：掛載後出現組框與成員、檢視組別下拉，且無 console.error', () => {
    const { container } = renderChart();

    // React Flow 容器掛載。
    expect(container.querySelector('.react-flow')).not.toBeNull();
    // 檢視組別下拉（OrgChartGroupSelector）。
    expect(screen.getByText('檢視組別')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // 成員節點姓名渲染。
    expect(screen.getByText('老闆')).toBeInTheDocument();
    expect(screen.getByText('中階')).toBeInTheDocument();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('groupZone 角落標籤顯示組名 + 組長徽章（leaderId → 姓名）', () => {
    const { container } = renderChart({ selectedGroupId: 'g1' });
    // 分區 aria-label 含組名（React Flow 在 jsdom 對節點 wrapper 設 visibility:hidden，
    // Testing Library 可及性查詢會略過隱藏元素 → 直接以 aria-label 前綴屬性選 GroupZoneNode 容器）。
    // 重設計 aria-label 為「組別分區 業務部（組長：…）」→ 以 ^= 前綴選取。
    expect(
      container.querySelector('[aria-label^="組別分區 業務部"]'),
    ).not.toBeNull();
    // 角落標籤顯示組名文字（單組視角下組名亦出現在「檢視組別」下拉當前值，
    // 故可能多於一處 → 至少有一處）。
    expect(screen.getAllByText('業務部').length).toBeGreaterThanOrEqual(1);
    // 組長徽章顯示組長姓名（leaderId='boss' → 老闆）。
    expect(screen.getByText(/組長：老闆/)).toBeInTheDocument();
  });

  it('姓名回退：leaderId null（空組）→ 組長徽章顯示「未指定」', () => {
    const data = makeOrgData({ groups: [group('empty', { name: '空組' })] });
    renderChart({ orgData: data, selectedGroupId: 'empty' });
    expect(screen.getByText(/組長：未指定/)).toBeInTheDocument();
  });

  it('co-leader 共管徽章顯示共管姓名（CEO/COO 案）', () => {
    // sales leaderId=CEO（不在 sales）；s1 主管 COO（組外、exec leaderId → 夠格）→ COO co-lead。
    const data = makeOrgData({
      employees: [
        emp('CEO', { name: '執行長' }),
        emp('COO', { name: '營運長' }),
        emp('s1', { name: '業務甲' }),
      ],
      groups: [
        group('sales', { name: '業務部', leaderId: 'CEO' }),
        group('exec', { name: '高管', leaderId: 'COO' }),
      ],
      assignments: [
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-coo', {
          employeeId: 'COO',
          groupId: 'exec',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s1', {
          employeeId: 's1',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
      ],
    });
    renderChart({ orgData: data, selectedGroupId: 'sales' });
    // 共管徽章顯示 co-leader 姓名（COO → 營運長）。
    expect(screen.getByText(/共管：營運長/)).toBeInTheDocument();
  });

  it('唯讀：無編輯工具列（無「進入編輯」「檢視模式」「儲存檢查點」）', () => {
    renderChart();
    expect(screen.queryByText('進入編輯')).not.toBeInTheDocument();
    expect(screen.queryByText('檢視模式')).not.toBeInTheDocument();
    expect(screen.queryByText('編輯模式')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '儲存檢查點' }),
    ).not.toBeInTheDocument();
  });

  it('唯讀：成員節點不可拖曳（無 draggable class）、背景分區不可選/不可拖', () => {
    const { container } = renderChart({ selectedGroupId: 'g1' });
    // 成員 employee 節點：可選（selectable）但無 draggable（nodesDraggable=false + 各節點 draggable:false）。
    const employeeNodes = container.querySelectorAll(
      '.react-flow__node-employee',
    );
    expect(employeeNodes.length).toBeGreaterThan(0);
    for (const n of employeeNodes) {
      expect(n.classList.contains('draggable')).toBe(false);
    }
    // 背景分區：不可選、不可拖（純背景視覺分組）。
    const zoneNodes = container.querySelectorAll('.react-flow__node-groupZone');
    expect(zoneNodes.length).toBeGreaterThan(0);
    for (const z of zoneNodes) {
      expect(z.classList.contains('draggable')).toBe(false);
      expect(z.classList.contains('selectable')).toBe(false);
    }
  });

  it('ALL 視角：多個 active 組各一背景分區（業務部 + 工程部）', () => {
    const { container } = renderChart({ selectedGroupId: ALL_GROUPS_VIEW_ID });
    // 兩個 active 組各一 groupZone 節點。
    expect(
      container.querySelectorAll('.react-flow__node-groupZone'),
    ).toHaveLength(2);
    // 兩組名皆渲染（各自角落標籤；至少一處）。
    expect(screen.getAllByText('業務部').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('工程部').length).toBeGreaterThanOrEqual(1);
    // 各分區容器以 aria-label 標示（直接選屬性，略過隱藏元素查詢限制）。
    expect(
      container.querySelector('[aria-label^="組別分區 業務部"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label^="組別分區 工程部"]'),
    ).not.toBeNull();
  });

  it('未知組別 → 顯示錯誤 Alert（找不到組別）', () => {
    renderChart({ selectedGroupId: 'ghost' });
    expect(screen.getByText('找不到組別')).toBeInTheDocument();
  });

  it('點選成員節點 → onNodeSelect 上拋裸 employeeId（非作用域化 id）', () => {
    const onNodeSelect = vi.fn();
    const { container } = renderChart({
      selectedGroupId: 'g1',
      onNodeSelect,
    });
    // 成員節點 wrapper 的 data-id 為作用域化 id（`${groupId}::${employeeId}`）。
    const node = container.querySelector('.react-flow__node-employee');
    expect(node).not.toBeNull();
    expect(node!.getAttribute('data-id')).toBe('g1::boss');
    // 但點選後上拋的是裸 employeeId（取自 node.data.employee.id），供 OrgDetailPanel 解析。
    fireEvent.click(node!);
    expect(onNodeSelect).toHaveBeenCalledTimes(1);
    expect(onNodeSelect).toHaveBeenCalledWith('boss');
  });

  it('點選背景分區 → onNodeSelect(null)（分區不可選，視為清空）', () => {
    const onNodeSelect = vi.fn();
    const { container } = renderChart({
      selectedGroupId: 'g1',
      onNodeSelect,
    });
    const zone = container.querySelector('.react-flow__node-groupZone');
    expect(zone).not.toBeNull();
    fireEvent.click(zone!);
    expect(onNodeSelect).toHaveBeenCalledWith(null);
  });

  it('ALL 視角 diff 著色以 employeeId：同員工跨組著色一致', () => {
    // base→current：dual（同時隸屬 g1/g2）改名 → diff 視為 modified。
    // diffMap 以裸 employeeId 建/查 → dual 在 g1、g2 兩框的節點皆應套用 modified 樣式。
    const base = makeOrgData({
      employees: [emp('dual', { name: '原名' }), emp('a0'), emp('b0')],
      groups: [group('g1', { leaderId: 'a0' }), group('g2', { leaderId: 'b0' })],
      assignments: [
        assignment('a0-g1', { employeeId: 'a0', groupId: 'g1' }),
        assignment('b0-g2', { employeeId: 'b0', groupId: 'g2' }),
        assignment('d-g1', { employeeId: 'dual', groupId: 'g1' }),
        assignment('d-g2', {
          employeeId: 'dual',
          groupId: 'g2',
          isPrimaryGroup: false,
        }),
      ],
    });
    const current: OrgData = {
      ...base,
      employees: base.employees.map((e) =>
        e.id === 'dual' ? { ...e, name: '新名' } : e,
      ),
    };
    const diffResult = computeOrgDiff(base, current);

    const { container } = renderChart({
      orgData: current,
      selectedGroupId: ALL_GROUPS_VIEW_ID,
      diffResult,
    });

    // dual 在 g1、g2 兩框各一節點（id 作用域化）。
    const dualG1 = container.querySelector('[data-id="g1::dual"]');
    const dualG2 = container.querySelector('[data-id="g2::dual"]');
    expect(dualG1).not.toBeNull();
    expect(dualG2).not.toBeNull();
    // modified 著色：orgFlowNodeStyles 以 bg-amber-50 標示 modified；節點本體在 wrapper 內。
    expect(dualG1!.querySelector('.bg-amber-50')).not.toBeNull();
    expect(dualG2!.querySelector('.bg-amber-50')).not.toBeNull();
    // 對照：未變更員工（a0）不套用 modified 樣式。
    const a0 = container.querySelector('[data-id="g1::a0"]');
    expect(a0).not.toBeNull();
    expect(a0!.querySelector('.bg-amber-50')).toBeNull();
  });
});
