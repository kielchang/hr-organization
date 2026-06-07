import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ReportingEditCanvas } from './ReportingEditCanvas';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';
import { compareOrgHealth } from '../../services/orgHealth';
import { assignment, emp, group, jobLevel, makeOrgData } from '../../test/fixtures';
import type { OrgData } from '../../types/org';
import type { EditSession } from '../../types/editSession';
import type { UseOrgFlowEditing } from '../../hooks/useOrgFlowEditing';

/**
 * ReportingEditCanvas 針對「本元件自有分支」的測試（不重複頁面已涵蓋的進編輯流程）：
 * - staleDataWarning Alert 的條件渲染 + dismiss 回調。
 * - asidePanel slot 會被渲染。
 * - 編輯態且有 impactDelta → EditImpactBar 浮層出現（非編輯態不出現）。
 *
 * 以手構的 editing stub 餵入（不依賴真實 useOrgFlowEditing），避免 OrgProvider/編輯 session
 * 的耦合；OrgFlowChart 掛載需 ResizeObserver，比照既有測試提供最小 stub。
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

/** 最小可渲染 OrgData：一名員工、一個部門、一筆主歸屬。 */
function seedOrgData(): OrgData {
  return makeOrgData({
    groups: [group('dept', { kind: 'department' })],
    jobLevels: [jobLevel('j1', 10)],
    employees: [emp('e1', { name: '甲' })],
    assignments: [
      assignment('as-e1', { employeeId: 'e1', groupId: 'dept', jobLevelId: 'j1' }),
    ],
  });
}

/** 手構 useOrgFlowEditing 回傳值；可覆寫個別欄位。 */
function makeEditingStub(
  overrides: Partial<UseOrgFlowEditing> = {},
): UseOrgFlowEditing {
  const orgData = seedOrgData();
  return {
    isEditMode: false,
    session: null,
    orgData,
    impactDelta: null,
    diffResult: null,
    staleDataWarning: false,
    enterEditMode: vi.fn(),
    exitEditMode: vi.fn(),
    saveCheckpoint: vi.fn(),
    publish: vi.fn(),
    onDraftChange: vi.fn(),
    previewSnapshot: vi.fn(),
    rollbackToSnapshot: vi.fn(),
    dismissStaleWarning: vi.fn(),
    ...overrides,
  };
}

function renderCanvas(editing: UseOrgFlowEditing, asidePanel?: React.ReactNode) {
  return renderWithProviders(
    <ReportingEditCanvas
      editing={editing}
      resolvedGroupId={ALL_GROUPS_VIEW_ID}
      onGroupChange={vi.fn()}
      selectedEmployeeId={null}
      onNodeSelect={vi.fn()}
      asidePanel={asidePanel}
    />,
  );
}

describe('ReportingEditCanvas', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('staleDataWarning=false 時不顯示外部變更警示', () => {
    renderCanvas(makeEditingStub({ staleDataWarning: false }));
    expect(screen.queryByText(/底層資料已在外部變更/)).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('staleDataWarning=true 時顯示警示，點關閉鈕呼叫 dismissStaleWarning', async () => {
    const user = userEvent.setup();
    const dismissStaleWarning = vi.fn();
    renderCanvas(makeEditingStub({ staleDataWarning: true, dismissStaleWarning }));

    expect(screen.getByText(/底層資料已在外部變更/)).toBeInTheDocument();

    // Alert 內唯一的 button 即關閉鈕。
    const alertRegion = screen.getByText(/底層資料已在外部變更/).closest('[role="alert"]');
    expect(alertRegion).not.toBeNull();
    await user.click(alertRegion!.querySelector('button')!);
    expect(dismissStaleWarning).toHaveBeenCalledTimes(1);
  });

  it('傳入的 asidePanel 會被渲染於版面中', () => {
    renderCanvas(
      makeEditingStub(),
      <aside aria-label="測試面板">面板內容</aside>,
    );
    expect(
      screen.getByRole('complementary', { name: '測試面板' }),
    ).toBeInTheDocument();
    expect(screen.getByText('面板內容')).toBeInTheDocument();
  });

  /** 帶一筆快照的編輯 session stub（讓「快照清單」toggle 與 SnapshotPanel 可渲染）。 */
  function editSessionWithSnapshot(): EditSession {
    const data = seedOrgData();
    return {
      baseData: data,
      draftData: data,
      previewingSnapshotId: null,
      snapshots: [
        {
          id: 'snap-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          description: '初版',
          orgData: data,
          nodePositions: {},
        },
      ],
    };
  }

  it('儲存檢查點流程：確認後呼叫 saveCheckpoint 並開啟快照面板，可關閉與切換', async () => {
    const user = userEvent.setup();
    const saveCheckpoint = vi.fn();
    renderCanvas(
      makeEditingStub({
        isEditMode: true,
        session: editSessionWithSnapshot(),
        saveCheckpoint,
      }),
    );

    // 進入儲存檢查點輸入 → 填說明 → 確認 → 委派 editing.saveCheckpoint 並開啟面板。
    await user.click(screen.getByRole('button', { name: '儲存檢查點' }));
    await user.type(screen.getByPlaceholderText('輸入檢查點說明…'), '調整甲層級');
    await user.click(screen.getByRole('button', { name: '確認' }));

    expect(saveCheckpoint).toHaveBeenCalledWith('調整甲層級');
    // SnapshotPanel 開啟（其標題列「快照清單」+ 關閉鈕）。
    expect(
      screen.getByRole('button', { name: '關閉快照清單' }),
    ).toBeInTheDocument();

    // 關閉快照面板（onClose）。
    await user.click(screen.getByRole('button', { name: '關閉快照清單' }));
    expect(
      screen.queryByRole('button', { name: '關閉快照清單' }),
    ).not.toBeInTheDocument();

    // 以工具列的「快照清單」toggle 再次開啟（onToggleSnapshotPanel）。
    await user.click(screen.getByRole('button', { name: /快照清單/ }));
    expect(
      screen.getByRole('button', { name: '關閉快照清單' }),
    ).toBeInTheDocument();
  });

  it('捨棄編輯：確認後呼叫 exitEditMode', async () => {
    const user = userEvent.setup();
    const exitEditMode = vi.fn();
    renderCanvas(
      makeEditingStub({
        isEditMode: true,
        session: editSessionWithSnapshot(),
        exitEditMode,
      }),
    );

    await user.click(screen.getByRole('button', { name: '捨棄' }));
    await user.click(screen.getByRole('button', { name: '確定捨棄' }));
    expect(exitEditMode).toHaveBeenCalledTimes(1);
  });

  it('發布：確認後呼叫 publish', async () => {
    const user = userEvent.setup();
    const publish = vi.fn();
    renderCanvas(
      makeEditingStub({
        isEditMode: true,
        session: editSessionWithSnapshot(),
        publish,
      }),
    );

    await user.click(screen.getByRole('button', { name: '發布' }));
    await user.click(screen.getByRole('button', { name: '確定發布' }));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('編輯態且有 impactDelta → 顯示 before→after 指標浮層；非編輯態不顯示', () => {
    // 構造一組 base→draft 有差異的 delta（draft 多一名 inactive 不影響，這裡用同份即可有 metrics）。
    const base = seedOrgData();
    const draft = seedOrgData();
    const impactDelta = compareOrgHealth(base, draft);

    const { unmount } = renderCanvas(
      makeEditingStub({ isEditMode: true, impactDelta }),
    );
    // EditImpactBar 浮層（以其 aria-label 辨識）。
    expect(
      screen.getByLabelText('本次調整的影響'),
    ).toBeInTheDocument();
    unmount();

    // 非編輯態：即使 impactDelta 存在也不渲染浮層。
    renderCanvas(makeEditingStub({ isEditMode: false, impactDelta }));
    expect(screen.queryByLabelText('本次調整的影響')).not.toBeInTheDocument();
  });
});
