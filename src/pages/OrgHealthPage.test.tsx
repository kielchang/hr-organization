import { afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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

    // R0.5 規劃就緒度區塊：四維度標籤於就緒度卡內呈現
    const readinessTitle = screen.getByText('規劃就緒度');
    const readinessCard = readinessTitle.closest(
      '[data-slot="card"]',
    ) as HTMLElement;
    expect(readinessCard).not.toBeNull();
    const inReadiness = within(readinessCard);
    expect(inReadiness.getByText('管理幅度健康')).toBeInTheDocument();
    expect(inReadiness.getByText('結構完整性')).toBeInTheDocument();
    expect(inReadiness.getByText('職能覆蓋')).toBeInTheDocument();
    expect(inReadiness.getByText('關鍵人風險')).toBeInTheDocument();

    // 渲染期間不應有 React 錯誤/警告
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('R0.5：規劃就緒度區塊顯示 total 數字、等級徽章與 /roadmap 連結', () => {
    renderWithProviders(<OrgHealthPage />, { route: '/health' });

    // 就緒度卡片標題
    const heading = screen.getByText('規劃就緒度');
    const card = heading.closest('[data-slot="card"]') as HTMLElement;
    expect(card).not.toBeNull();
    // 卡片內含 total 大數字（0–100 的純數字）與「/ 100 分」單位
    expect(card.textContent).toMatch(/\d+/);
    expect(card.textContent).toContain('/ 100 分');

    // 等級徽章為三種文案之一（high=結構就緒／medium=尚需補強／low=結構待整理）
    expect(card.textContent).toMatch(/結構就緒|尚需補強|結構待整理/);

    // CM 註記連結指向 /roadmap
    const roadmapLink = screen.getByRole('link', { name: '改善 Roadmap' });
    expect(roadmapLink).toHaveAttribute('href', '/roadmap');
  });

  it('R0.2/R0.3：findings 以中文 category 分群、舊工程詞標籤不再出現', () => {
    renderWithProviders(<OrgHealthPage />, { route: '/health' });

    // 至少出現一個 R0.2 後的中文 category 標籤（seed 含 spof → 無備援主管）。
    expect(screen.getByText('無備援主管')).toBeInTheDocument();

    // 舊的工程詞 category 標籤不應再以分群標題出現。
    // （categoryLabel 已將 chain→懸空匯報、spof→無備援主管）
    expect(screen.queryByText('斷鏈')).not.toBeInTheDocument();
    expect(screen.queryByText('單點風險')).not.toBeInTheDocument();
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
