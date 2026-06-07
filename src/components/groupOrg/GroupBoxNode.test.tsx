import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { GroupBoxNode, type GroupBoxRenderData } from './GroupBoxNode';

/**
 * GroupBoxNode（D2 組別群組框）渲染補強測試。
 *
 * 聚焦兩個補強的元件側產出：
 * 1. **組內層級輔助線**：依 `data.levelLines` 渲染 N 條 `.group-org-level-line`
 *    + N 個 `.group-org-level-label`（文字「第N層」），整層 `aria-hidden`（裝飾性）。
 *    每條以 inline `top: lv.y` 絕對定位（框內相對座標、由 buildGroupOrgGraph 算出）。
 * 2. **組間階層邊錨點 Handle**：兩個唯讀 Handle（target/Top + source/Bottom）→
 *    渲染出兩個 `.react-flow__handle`，供既有組間邊渲染。
 *
 * GroupBoxNode 為 React Flow 自訂節點，Handle 依賴 ReactFlowProvider context
 * （比照 EmployeeNode.snapshot.test）→ 以 Provider 包裹渲染。
 */

/** 在 ReactFlowProvider 內渲染 GroupBoxNode（Handle 需 RF context）。 */
function renderBox(data: GroupBoxRenderData) {
  return render(
    <ReactFlowProvider>
      <GroupBoxNode {...({ data } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  );
}

/** 三層層線的基準 data（label 沿用實作格式「第 N 層」）。 */
function makeData(
  overrides: Partial<GroupBoxRenderData> = {},
): GroupBoxRenderData {
  return {
    groupId: 'g1',
    groupName: '業務部',
    kind: 'department',
    leaderId: 'boss',
    coLeaderIds: [],
    width: 280,
    height: 600,
    levelLines: [
      { level: 1, y: 136, label: '第 1 層' },
      { level: 2, y: 368, label: '第 2 層' },
      { level: 3, y: 600, label: '第 3 層' },
    ],
    leaderName: '老闆',
    coLeaderNames: [],
    ...overrides,
  };
}

describe('GroupBoxNode 組內層級輔助線', () => {
  it('依 data.levelLines 渲染 N 條 .group-org-level-line + N 個 .group-org-level-label', () => {
    const { container } = renderBox(makeData());
    expect(container.querySelectorAll('.group-org-level-line')).toHaveLength(3);
    expect(container.querySelectorAll('.group-org-level-label')).toHaveLength(3);
  });

  it('每個 .group-org-level-label 文字為「第N層」（對齊 data.levelLines.label）', () => {
    const { container } = renderBox(makeData());
    const labels = Array.from(
      container.querySelectorAll('.group-org-level-label'),
    ).map((el) => el.textContent);
    expect(labels).toEqual(['第 1 層', '第 2 層', '第 3 層']);
    // 結構不變式：每個標籤皆為「第…層」字樣（容許數字前後空白）。
    for (const text of labels) {
      expect(text).toMatch(/^第\s*\d+\s*層$/);
    }
  });

  it('每條層線以 inline top = lv.y 絕對定位（框內相對座標）', () => {
    const data = makeData();
    const { container } = renderBox(data);
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>('.group-org-level-line'),
    );
    expect(lines).toHaveLength(data.levelLines.length);
    lines.forEach((line, i) => {
      // y 值帶進 inline style top（px）→ 與 data.levelLines[i].y 對應。
      expect(line.style.top).toBe(`${data.levelLines[i].y}px`);
      expect(line.style.position).toBe('absolute');
    });
  });

  it('層線數量隨 levelLines 變動：單條 → 一條線一個標籤', () => {
    const { container } = renderBox(
      makeData({ levelLines: [{ level: 1, y: 136, label: '第 1 層' }] }),
    );
    expect(container.querySelectorAll('.group-org-level-line')).toHaveLength(1);
    expect(container.querySelectorAll('.group-org-level-label')).toHaveLength(1);
    expect(
      container.querySelector('.group-org-level-label')?.textContent,
    ).toBe('第 1 層');
  });

  it('無層線（空組）→ 不渲染任何層線/標籤', () => {
    const { container } = renderBox(makeData({ levelLines: [] }));
    expect(container.querySelectorAll('.group-org-level-line')).toHaveLength(0);
    expect(container.querySelectorAll('.group-org-level-label')).toHaveLength(0);
  });

  it('層線置於 aria-hidden 裝飾層（不汙染無障礙樹）', () => {
    const { container } = renderBox(makeData());
    // 每條層線的祖先中存在 aria-hidden 容器（裝飾性輔助線）。
    const line = container.querySelector('.group-org-level-line');
    expect(line).not.toBeNull();
    expect(line!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('GroupBoxNode 組間階層邊錨點 Handle', () => {
  it('渲染兩個 .react-flow__handle（target/Top + source/Bottom）供組間邊錨定', () => {
    const { container } = renderBox(makeData());
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles).toHaveLength(2);
  });

  it('Handle 含 target（top）與 source（bottom）各一', () => {
    const { container } = renderBox(makeData());
    // React Flow 以 class 標示 Handle 類型與位置。
    expect(
      container.querySelectorAll('.react-flow__handle-top'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('.react-flow__handle-bottom'),
    ).toHaveLength(1);
  });

  it('Handle 唯讀（isConnectable=false → connectable class 缺席）', () => {
    const { container } = renderBox(makeData());
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles.length).toBeGreaterThan(0);
    // 唯讀 Handle 不帶 connectable 類別（不可手動連線、僅供既有邊渲染錨點）。
    for (const h of handles) {
      expect(h.classList.contains('connectable')).toBe(false);
    }
  });
});

describe('GroupBoxNode 標題列（既有行為不回歸）', () => {
  it('框容器 role=group、aria-label 含組名', () => {
    const { container } = renderBox(makeData({ groupName: '工程部' }));
    const box = container.querySelector('[role="group"]');
    expect(box).not.toBeNull();
    expect(box!.getAttribute('aria-label')).toBe('組別 工程部');
  });

  it('組長徽章顯示組長姓名；無 co-leader → 不顯示共管徽章', () => {
    const { container } = renderBox(
      makeData({ leaderName: '王經理', coLeaderNames: [] }),
    );
    expect(container.textContent).toContain('組長：王經理');
    expect(container.textContent).not.toContain('共管：');
  });

  it('leaderName=null → 組長徽章顯示「未指定」', () => {
    const { container } = renderBox(makeData({ leaderName: null }));
    expect(container.textContent).toContain('組長：未指定');
  });

  it('有 co-leader → 共管徽章顯示串接姓名', () => {
    const { container } = renderBox(
      makeData({ coLeaderNames: ['營運長', '財務長'] }),
    );
    expect(container.textContent).toContain('共管：營運長、財務長');
  });
});
