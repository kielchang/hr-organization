import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { GroupZoneNode, type GroupZoneRenderData } from './GroupZoneNode';

/**
 * GroupZoneNode（D2 組別**背景分區**，取代舊 GroupBoxNode）渲染測試。
 *
 * 重設計：分區為**背景泳道**（淡色色塊 + 角落「組名・組長」標籤），非容器框。
 * 聚焦元件側產出：
 * - **背景色塊**：根容器帶 `.group-org-zone`、以 CSS 變數 `--zone-hue` 承載色相。
 * - **整層不互動**：根容器 `pointer-events-none`（不擋疊於上方的成員節點）。
 * - **角落標籤**：組名 + 組長徽章（Crown icon，文字「組長：…」）；有 co-leader 時
 *   顯示共管徽章（Users icon，文字「共管：…」）。
 * - **a11y**：根容器 role=group、aria-label 標出組別與組長（語意不只靠顏色）。
 * - **無框內層級輔助線**：不渲染任何 `.group-org-level-line`（levelLines 已移除）。
 *
 * GroupZoneNode 為 React Flow 自訂節點 → 以 ReactFlowProvider 包裹渲染。
 */

/** 在 ReactFlowProvider 內渲染 GroupZoneNode。 */
function renderZone(data: GroupZoneRenderData) {
  return render(
    <ReactFlowProvider>
      <GroupZoneNode {...({ data } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  );
}

/** 基準 render data（GroupZoneRenderData：D1 data + 解析後姓名）。 */
function makeData(
  overrides: Partial<GroupZoneRenderData> = {},
): GroupZoneRenderData {
  return {
    groupId: 'g1',
    groupName: '業務部',
    kind: 'department',
    leaderId: 'boss',
    coLeaderIds: [],
    width: 520,
    height: 600,
    hue: 212,
    leaderName: '老闆',
    coLeaderNames: [],
    ...overrides,
  };
}

describe('GroupZoneNode 背景分區', () => {
  it('渲染背景色塊容器 .group-org-zone，並以 --zone-hue 承載色相', () => {
    const { container } = renderZone(makeData({ hue: 152 }));
    const zone = container.querySelector<HTMLElement>('.group-org-zone');
    expect(zone).not.toBeNull();
    // CSS 變數 --zone-hue 帶入 hue（供低彩度淡色背景/邊）。
    expect(zone!.style.getPropertyValue('--zone-hue')).toBe('152');
  });

  it('整層 pointer-events-none（不擋疊於上方的成員節點）', () => {
    const { container } = renderZone(makeData());
    const zone = container.querySelector('.group-org-zone');
    expect(zone).not.toBeNull();
    expect(zone!.classList.contains('pointer-events-none')).toBe(true);
  });

  it('無框內層級輔助線（.group-org-level-line / .group-org-level-label 皆不存在）', () => {
    const { container } = renderZone(makeData());
    expect(container.querySelectorAll('.group-org-level-line')).toHaveLength(0);
    expect(container.querySelectorAll('.group-org-level-label')).toHaveLength(0);
  });

  it('不渲染任何 React Flow Handle（分區不可連線、無錨點）', () => {
    const { container } = renderZone(makeData());
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0);
  });
});

describe('GroupZoneNode 可及性（a11y）', () => {
  it('根容器 role=group、aria-label 含組別與組長（語意不只靠顏色）', () => {
    const { container } = renderZone(makeData({ groupName: '工程部', leaderName: '王經理' }));
    const zone = container.querySelector('[role="group"]');
    expect(zone).not.toBeNull();
    const label = zone!.getAttribute('aria-label')!;
    expect(label).toContain('組別分區 工程部');
    expect(label).toContain('組長：王經理');
  });

  it('leaderName=null → aria-label 與徽章皆顯示「未指定」', () => {
    const { container } = renderZone(makeData({ leaderName: null }));
    const zone = container.querySelector('[role="group"]')!;
    expect(zone.getAttribute('aria-label')).toContain('組長：未指定');
    expect(container.textContent).toContain('組長：未指定');
  });

  it('有 co-leader → aria-label 含共管姓名', () => {
    const { container } = renderZone(
      makeData({ coLeaderNames: ['營運長', '財務長'] }),
    );
    const zone = container.querySelector('[role="group"]')!;
    expect(zone.getAttribute('aria-label')).toContain('共管：營運長、財務長');
  });
});

describe('GroupZoneNode 角落標籤（組名 + 徽章）', () => {
  it('顯示組名文字', () => {
    const { container } = renderZone(makeData({ groupName: '研發部' }));
    expect(container.textContent).toContain('研發部');
  });

  it('組長徽章顯示組長姓名；無 co-leader → 不顯示共管徽章', () => {
    const { container } = renderZone(
      makeData({ leaderName: '王經理', coLeaderNames: [] }),
    );
    expect(container.textContent).toContain('組長：王經理');
    expect(container.textContent).not.toContain('共管：');
  });

  it('leaderName=null → 組長徽章顯示「未指定」', () => {
    const { container } = renderZone(makeData({ leaderName: null }));
    expect(container.textContent).toContain('組長：未指定');
  });

  it('有 co-leader → 共管徽章顯示串接姓名', () => {
    const { container } = renderZone(
      makeData({ coLeaderNames: ['營運長', '財務長'] }),
    );
    expect(container.textContent).toContain('共管：營運長、財務長');
  });

  it('角落標籤亦為裝飾層、pointer-events-none（不擋成員點擊）', () => {
    const { container } = renderZone(makeData());
    const label = container.querySelector('.group-org-zone__label');
    expect(label).not.toBeNull();
    expect(label!.classList.contains('pointer-events-none')).toBe(true);
  });
});
