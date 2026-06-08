import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { WorkbenchPage } from './WorkbenchPage';

/**
 * WorkbenchPage（/workbench）render smoke：以 renderWithProviders 掛載整頁，
 * 確認頁首、進入編輯入口出現，進編輯後浮現編輯態工具，且渲染期間無 console.error。
 *
 * React Flow（@xyflow/react）掛載時建立 ResizeObserver 量測容器，jsdom 未提供；
 * 比照 OrgChartPage.test 提供最小 stub（行為斷言不依賴實際量測）。
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

describe('WorkbenchPage 組織圖工作台 render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現頁首與「進入編輯」入口，且無 console.error', () => {
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    // 頁首標題
    expect(
      screen.getByRole('heading', { name: '組織圖工作台', level: 2 }),
    ).toBeInTheDocument();

    // reporting 視角的編輯工具列：初始為檢視模式 + 「進入編輯」按鈕
    expect(screen.getByText('檢視模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '進入編輯' }),
    ).toBeInTheDocument();

    // 預設為「全公司視角」：組別選擇器（檢視組別）當前值顯示「全公司」，
    // 而非預設挑某個單一組別（契約 §1：工作台以全公司開啟）。
    expect(screen.getByText('檢視組別')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('全公司');

    // 渲染期間不應有 React 錯誤/警告
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('點「進入編輯」後切到編輯模式，浮現「儲存檢查點／捨棄／發布」操作', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    await user.click(screen.getByRole('button', { name: '進入編輯' }));

    // 模式徽章切為「編輯模式」，編輯態按鈕浮現。
    expect(screen.getByText('編輯模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '儲存檢查點' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '捨棄' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '發布' })).toBeInTheDocument();

    // 進入編輯後不應產生 React 錯誤/警告。
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('右側即時整合面板與底部引導連結區出現（階段 2 版面）', () => {
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    // 右側可摺疊即時整合面板（landmark + 規劃就緒度徽章）。
    expect(
      screen.getByRole('complementary', { name: '即時整合面板' }),
    ).toBeInTheDocument();
    expect(screen.getByText('規劃就緒度')).toBeInTheDocument();

    // 底部「需要細節？」引導區與 5 條引導連結。
    expect(
      screen.getByRole('region', { name: '需要細節？' }),
    ).toBeInTheDocument();
    for (const label of [
      '人員管理',
      '組別管理',
      '情境比較',
      '流程衝擊分析',
      'CSV 匯入',
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

/**
 * 主視圖切換 Tabs（匯報組織圖 ↔ 組別組織圖 ↔ 組別歸屬圖；D2 加入、Phase E 擴充為
 * 可編輯、旅程優先 IA 整併後再加入第 3 視角「組別歸屬圖」）：
 * - 預設停在 reporting（避免驚嚇）。
 * - 切到「組別組織圖」→ 顯示 GroupOrgEditCanvas（組框出現）。
 * - 切換時 groupId / selectedEmployeeId 不重設（lift 至頁面、跨 panel remount 保留）。
 * - 組別視圖（Phase E 起）**也有編輯工具列**，且與 reporting 共用同一編輯 session。
 *
 * Base UI Select（檢視組別下拉）以 findByRole('listbox') 等非同步查詢驅動，
 * 控制式（value 受控）下穩定；偶發 flaky 時單獨重跑確認（見任務說明）。
 */
describe('WorkbenchPage 主視圖切換（匯報 ↔ 組別）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('預設停在匯報組織圖（reporting）：reporting 工具列在、組別框不在', () => {
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    // 三個主視圖 tab 皆存在（旅程優先 IA 整併後，組別歸屬圖併入為第 3 視角）。
    expect(screen.getByRole('tab', { name: /匯報組織圖/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /組別組織圖/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /組別歸屬圖/ })).toBeInTheDocument();

    // 預設 reporting：編輯工具列（檢視模式 + 進入編輯）可見。
    expect(screen.getByText('檢視模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '進入編輯' }),
    ).toBeInTheDocument();

    // 組別視圖 panel 未掛載（Base UI Tabs 預設卸載非 active panel）→ 無 groupZone 分區。
    expect(
      document.querySelectorAll('.react-flow__node-groupZone'),
    ).toHaveLength(0);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('切到「組別組織圖」→ 顯示 GroupOrgEditCanvas（組框出現、組別 tab 自帶編輯工具列）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));

    // 組別背景分區出現（seed 有多個 active 組 → 多分區）。
    await waitFor(() =>
      expect(
        document.querySelectorAll('.react-flow__node-groupZone').length,
      ).toBeGreaterThan(0),
    );

    // Phase E：組別 tab 現在改用 GroupOrgEditCanvas（含 EditModeToolbar），
    // 不再唯讀。切走 reporting panel 後僅剩組別 tab 自己的工具列。
    expect(screen.getByText('檢視模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '進入編輯' }),
    ).toBeInTheDocument();

    // 成員節點 id 已作用域化（`${groupId}::${employeeId}`）→ 全公司視角下
    // 跨多組同一員工不再產生重複 node key；切換不應有 console.error。
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('組別 tab 進入編輯：浮現「儲存檢查點／捨棄／發布」（與 reporting 共用同一 editing session）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('.react-flow__node-groupZone').length,
      ).toBeGreaterThan(0),
    );

    // 在組別 tab 自帶工具列上進入編輯模式。
    await user.click(screen.getByRole('button', { name: '進入編輯' }));

    // 編輯態徽章與按鈕浮現（GroupOrgEditCanvas 與 reporting 共用 useOrgFlowEditing）。
    expect(screen.getByText('編輯模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '儲存檢查點' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '捨棄' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '發布' })).toBeInTheDocument();

    // 共用 session：切回匯報 tab，仍為編輯模式（同一 editing 狀態跨 tab 保留）。
    await user.click(screen.getByRole('tab', { name: /匯報組織圖/ }));
    expect(screen.getByText('編輯模式')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '儲存檢查點' }),
    ).toBeInTheDocument();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  /**
   * 跨多組同一員工不再重複 node key（先前缺口已修）：
   *
   * 全公司視角下 `buildGroupOrgGraph` 對「跨多組的同一員工」（成員或 co-leader）
   * 改以組別範圍化 id（`${groupId}::${employeeId}`）建成員節點 → 不再碰撞，
   * React Flow 不再出現「two children with the same key」警告、節點也不掉。
   *
   * 本案以 seed（含跨多組員工，如 e1 屬 g1/g2/g3/g5/g6 等）驗證：切到全公司組別
   * 視圖**不會**產生「重複 key」warning。
   */
  it('全公司組別視圖：跨多組同一員工 → 無重複 node key 警告（作用域化 id）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('.react-flow__node-groupZone').length,
      ).toBeGreaterThan(0),
    );

    // seed 內有跨多組員工（e1 屬 g1/g2/g3/g5/g6 等）→ 作用域化後不再觸發重複 key 警告。
    const sawDupKeyWarning = errorSpy.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('same key'),
    );
    expect(sawDupKeyWarning).toBe(false);
  });

  it('切換不重設 groupId：在組別視圖選定單一組，切走再切回仍維持該組', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    // 進組別視圖。
    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));
    // 預設全公司視角。
    expect(screen.getByRole('combobox')).toHaveTextContent('全公司');

    // 透過「檢視組別」下拉選一個單一組（研發部）。
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '研發部' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent('研發部'),
    );

    // 切回匯報視圖、再切回組別視圖。
    await user.click(screen.getByRole('tab', { name: /匯報組織圖/ }));
    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));

    // groupId 受 lift 至頁面 → 切換不重設，組別選擇仍為「研發部」。
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent('研發部'),
    );
    expect(screen.getByRole('combobox')).not.toHaveTextContent('全公司');
  });

  it('切換不重設 selectedEmployeeId：在組別視圖選一節點，切走再切回詳情仍開', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });

    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));

    // 先切到單一組（研發部）：避開全公司視角的「重複 node key」缺口，
    // 聚焦驗證 selectedEmployeeId 的跨 tab 保留行為。
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '研發部' }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('.react-flow__node-employee').length,
      ).toBeGreaterThan(0),
    );

    // 點選任一成員節點 → 開啟詳情面板（OrgDetailPanel）。
    const firstEmployee = document.querySelector(
      '.react-flow__node-employee',
    ) as HTMLElement;
    await user.click(firstEmployee);

    // 詳情面板出現（以關閉鈕為錨；其無障礙名稱「關閉」來自 title）。
    expect(
      await screen.findByRole('button', { name: '關閉' }),
    ).toBeInTheDocument();

    // 切走再切回 → selectedEmployeeId 受 lift 保留 → 詳情仍開。
    await user.click(screen.getByRole('tab', { name: /匯報組織圖/ }));
    await user.click(screen.getByRole('tab', { name: /組別組織圖/ }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '關閉' }),
      ).toBeInTheDocument(),
    );
    // 同時確認 groupId 也維持研發部（單組視角不重設）。
    expect(screen.getByRole('combobox')).toHaveTextContent('研發部');
  });
});

/**
 * 組別歸屬圖（membership，第 3 視角）—— 旅程優先 IA 整併後自 /org-chart 原封搬入。
 * 這裡是 membership 行為的**權威測試家**（OrgChartPage.test 已精簡為 deprecation 冒煙）。
 *
 * 覆蓋：
 * - 切到「組別歸屬圖」後出現種類過濾子 Tabs（全部／部門／職能）。
 * - FunctionCoveragePanel（「職能覆蓋訊號」）的條件顯示：
 *     membershipKind !== 'department' 時顯示；切「部門」時不顯示（對齊 src 條件）。
 * - kind 與選組不符時自動切回全公司視角（auto-revert）。
 *
 * 取得「檢視組別」下拉目前顯示文字：membership 圖沿用 OrgChartGroupSelector，
 * 其 trigger id 仍為 `org-chart-group-select`（自 OrgChartPage 共用元件搬入）。
 */
function membershipSelectorText() {
  return document.getElementById('org-chart-group-select')?.textContent ?? '';
}

describe('WorkbenchPage 第 3 視角：組別歸屬圖（membership）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** 切到「組別歸屬圖」視角，並等候種類過濾子 Tabs 浮現。 */
  async function gotoMembership(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<WorkbenchPage />, { route: '/workbench' });
    await user.click(screen.getByRole('tab', { name: /組別歸屬圖/ }));
    // 種類過濾子 Tabs（全部／部門／職能）為 membership 視角專屬，等其掛載完成。
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '部門' })).toBeInTheDocument(),
    );
  }

  it('切到「組別歸屬圖」→ 出現種類過濾子 Tabs（全部／部門／職能）', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    // 三個種類過濾 tab 皆在（與 reporting/group/membership 主 tab 並存）。
    expect(screen.getByRole('tab', { name: '全部' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '部門' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '職能' })).toBeInTheDocument();

    // 預設過濾為「全部」（all）→ FunctionCoveragePanel 顯示（seed 含職能 g7/g8）。
    expect(
      screen.getByRole('heading', { name: '職能覆蓋訊號', level: 3 }),
    ).toBeInTheDocument();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('切「部門」過濾 → FunctionCoveragePanel（職能覆蓋訊號）隱藏；切回「職能」→ 重新顯示', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    // 預設「全部」：職能覆蓋訊號可見。
    expect(
      screen.getByRole('heading', { name: '職能覆蓋訊號' }),
    ).toBeInTheDocument();

    // 切「部門」：對齊 src 條件 membershipKind !== 'department' → 面板隱藏。
    await user.click(screen.getByRole('tab', { name: '部門' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '職能覆蓋訊號' }),
      ).not.toBeInTheDocument(),
    );

    // 切「職能」：membershipKind === 'function'（!== 'department'）→ 面板再次顯示。
    await user.click(screen.getByRole('tab', { name: '職能' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: '職能覆蓋訊號' }),
      ).toBeInTheDocument(),
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('選定部門組後切「職能」過濾（kind 不符）→ 自動切回全公司（auto-revert）', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    // 工作台預設以全公司開啟；先在 membership 視角選定單一部門組（前端組，kind=department）。
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '前端組' }));
    await waitFor(() => expect(membershipSelectorText()).toMatch(/前端組/));

    // 切「職能」過濾：前端組 kind=department 與「職能」不符 → 自動切回全公司視角。
    await user.click(screen.getByRole('tab', { name: '職能' }));
    await waitFor(() => expect(membershipSelectorText()).toMatch(/全公司/));
    expect(membershipSelectorText()).not.toMatch(/前端組/);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('選定部門組後切「部門」過濾（kind 相符）→ 維持原選定，不誤切回全公司', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    // 選定單一部門組（前端組，kind=department）。
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '前端組' }));
    await waitFor(() => expect(membershipSelectorText()).toMatch(/前端組/));

    // 切「部門」過濾：kind 相符 → 不應被切回全公司（與上一案的「切回」形成對照）。
    await user.click(screen.getByRole('tab', { name: '部門' }));
    await waitFor(() => expect(membershipSelectorText()).toMatch(/前端組/));
    expect(membershipSelectorText()).not.toMatch(/全公司/);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
