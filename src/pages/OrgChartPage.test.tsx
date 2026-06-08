import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { OrgChartPage } from './OrgChartPage';

/**
 * React Flow（@xyflow/react）掛載時會建立 ResizeObserver 量測容器，
 * jsdom 未提供此 API。提供最小 stub 讓元件能掛載，行為斷言不依賴實際量測。
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

/**
 * OrgChartPage 已 @deprecated：旅程優先 IA 整併後，`/org-chart` 路由改為導向 /workbench，
 * 本元件不再被路由引用、僅暫保留備援。其「組別歸屬圖」行為的**權威測試**已移至
 * WorkbenchPage.test（第 3 視角 membership 區塊）；此處只留最小冒煙，確認元件本體
 * 仍能掛載且兩個內嵌圖表 tab 仍在，避免在保留期間悄悄壞掉。未來移除此頁時連同此檔刪除。
 */
describe('OrgChartPage（@deprecated）掛載冒煙', () => {
  it('仍可掛載並渲染頁首「組織圖」與兩個圖表 tab（匯報組織圖／組別歸屬圖）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrgChartPage />, { route: '/' });

    // 頁首標題仍在（元件本體邏輯未隨整併變動）。
    expect(
      screen.getByRole('heading', { name: '組織圖', level: 2 }),
    ).toBeInTheDocument();

    // 兩個內嵌圖表 tab 仍可見。
    expect(
      screen.getByRole('tab', { name: '匯報組織圖' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: '組別歸屬圖' }),
    ).toBeInTheDocument();

    // 切到「組別歸屬圖」仍能浮現種類過濾子 Tabs（行為等價；權威斷言在 WorkbenchPage.test）。
    await user.click(screen.getByRole('tab', { name: '組別歸屬圖' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '部門' })).toBeInTheDocument(),
    );
  });
});
