import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
