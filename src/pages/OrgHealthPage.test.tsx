import { afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { OrgHealthPage } from './OrgHealthPage';

/**
 * OrgHealthPage render smoke：以 renderWithProviders 載入 seed 資料掛載整頁，
 * 確認關鍵區塊出現且渲染期間無 console.error。
 *
 * 此頁不使用 React Flow（僅 Card/Badge/Table + FunctionCoveragePanel），
 * 故 jsdom 可直接掛載，無需 ResizeObserver polyfill。
 */
describe('OrgHealthPage 規劃健檢 render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現標題與各關鍵區塊，且無 console.error', () => {
    renderWithProviders(<OrgHealthPage />, { route: '/health' });

    // 頁面標題
    expect(
      screen.getByRole('heading', { name: '規劃健檢', level: 2 }),
    ).toBeInTheDocument();

    // 摘要卡片列：以標籤文字確認關鍵卡片存在
    expect(screen.getByText('在職人數')).toBeInTheDocument();
    expect(screen.getByText('平均管理幅度')).toBeInTheDocument();
    expect(screen.getByText('警示數')).toBeInTheDocument();

    // 主要區塊標題（管理幅度／層級深度／職能覆蓋／結構風險）
    expect(
      screen.getByText(/管理幅度（span of control）/),
    ).toBeInTheDocument();
    expect(screen.getByText(/層級深度（depth）/)).toBeInTheDocument();
    expect(screen.getByText('職能覆蓋訊號')).toBeInTheDocument();
    expect(screen.getByText('結構風險 / 警示清單')).toBeInTheDocument();

    // 渲染期間不應有 React 錯誤/警告
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('摘要卡片數值與服務輸出一致（在職人數為非負整數字串）', () => {
    renderWithProviders(<OrgHealthPage />, { route: '/health' });
    // 「在職人數」卡片標題（CardDescription）下方應有一個數字
    const label = screen.getByText('在職人數');
    const card = label.closest('[data-slot="card"]') as HTMLElement;
    // CardTitle 呈現數值；以該卡片內出現純數字驗證有渲染指標
    expect(card.textContent).toMatch(/在職人數\s*\d+/);
  });
});
