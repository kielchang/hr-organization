import { afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { OverviewPage } from './OverviewPage';

/**
 * OverviewPage render smoke：
 * 對應契約 docs/契約-整合UX收尾.md §4。
 *
 * 此頁無 React Flow，jsdom 可直接掛載。
 * - 歡迎標題與一句話定位
 * - 智慧 CTA：建議的下一步 + 行動按鈕
 * - 6 步旅程地圖：每步 label 應出現
 * - 目前狀態 5 個小卡標籤
 * - 渲染期間無 console.error
 */
describe('OverviewPage 總覽頁 render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現「HR 組織規劃」標題與一句話定位', () => {
    renderWithProviders(<OverviewPage />, { route: '/' });

    expect(screen.getByText('HR 組織規劃')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /以匯報線\s*×\s*專案職能雙維度規劃組織/,
        level: 2,
      }),
    ).toBeInTheDocument();
  });

  it('智慧 CTA 卡片顯示「建議的下一步」標籤與行動按鈕', () => {
    renderWithProviders(<OverviewPage />, { route: '/' });

    // CTA 標籤
    expect(screen.getByText('建議的下一步')).toBeInTheDocument();
    // 行動按鈕（aria-label 以「前往：」開頭）
    const ctaBtn = screen.getByRole('button', { name: /^前往：/ });
    expect(ctaBtn).toBeInTheDocument();
    // 視覺文字「立即開始」
    expect(ctaBtn.textContent).toMatch(/立即開始/);
  });

  it('規劃旅程地圖出現 6 步 label（載入現況／編輯人員與組別／規劃健檢／情境比較／變更影響／發布版本）', () => {
    renderWithProviders(<OverviewPage />, { route: '/' });

    // 區塊標題
    expect(
      screen.getByRole('heading', { name: '規劃旅程', level: 3 }),
    ).toBeInTheDocument();
    // 6 步 label
    expect(screen.getByText('載入現況')).toBeInTheDocument();
    expect(screen.getByText('編輯人員與組別')).toBeInTheDocument();
    // 「規劃健檢」可能也出現在側邊導覽（但本測試不掛 Layout，所以單一即可）
    expect(screen.getByText('規劃健檢')).toBeInTheDocument();
    expect(screen.getByText('情境比較')).toBeInTheDocument();
    expect(screen.getByText('變更影響')).toBeInTheDocument();
    expect(screen.getByText('發布版本')).toBeInTheDocument();

    // 「第 1 步」～「第 6 步」對應序號標籤皆在
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByText(`第 ${i} 步`)).toBeInTheDocument();
    }
  });

  it('狀態小卡 5 個標籤皆出現（在職員工／部門／專案職能／已發布版本／流程定義）', () => {
    renderWithProviders(<OverviewPage />, { route: '/' });

    expect(
      screen.getByRole('heading', { name: '目前狀態', level: 3 }),
    ).toBeInTheDocument();

    expect(screen.getByText('在職員工')).toBeInTheDocument();
    expect(screen.getByText('部門')).toBeInTheDocument();
    expect(screen.getByText('專案職能')).toBeInTheDocument();
    expect(screen.getByText('已發布版本')).toBeInTheDocument();
    expect(screen.getByText('流程定義')).toBeInTheDocument();
  });

  it('渲染過程沒有 console.error', () => {
    renderWithProviders(<OverviewPage />, { route: '/' });
    // sanity：頁面確實渲染
    expect(
      screen.getByRole('heading', {
        name: /以匯報線\s*×\s*專案職能雙維度規劃組織/,
      }),
    ).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
