import { afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { ScenarioComparePage } from './ScenarioComparePage';

/**
 * ScenarioComparePage 規劃情境比較 render smoke：
 * - 以 renderWithProviders 載入 seed 資料掛載整頁
 * - 確認關鍵區塊出現（標題、第一個槽含「基準」標示、未達 2 個情境的提示）
 * - 渲染期間無 console.error
 *
 * 此頁不使用 React Flow（僅 Card/Badge/Select/Table），jsdom 可直接掛載，
 * 無需 ResizeObserver / scrollIntoView polyfill（Select 內容未展開時不渲染）。
 *
 * 互動測試（在 jsdom 中切換 Radix Select 選項）已知脆弱，且服務行為已由
 * scenarioCompare.test.ts 覆蓋；此處只做純 render smoke。
 */
describe('ScenarioComparePage 規劃情境比較 render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現標題「情境比較」與說明文字，且無 console.error', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });

    // 頁面標題（h2 級別，避免與 Card 內標題誤判）
    expect(
      screen.getByRole('heading', { name: '情境比較', level: 2 }),
    ).toBeInTheDocument();

    // 說明文字中關鍵字「規劃指標對照」「結構差異摘要」於提示段落出現
    // 用部分字串匹配以避免硬綁文案細節
    expect(
      screen.getByText(/規劃指標對照與結構差異摘要/),
    ).toBeInTheDocument();

    // 渲染期間不應有 React 錯誤/警告
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('第一個槽預設選了 active 版本，顯示「基準」標示', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });

    // 「基準」Badge 應只在第一個槽出現（次要槽尚未滿 2 個情境，指標表還沒渲染）
    // 此處用 getAllByText 容忍同字串多處出現；但至少要有 1 個
    const baselineBadges = screen.getAllByText('基準');
    expect(baselineBadges.length).toBeGreaterThanOrEqual(1);

    // 基準槽應顯示版本健檢摘要的標籤（在職人數 / 部門 / 職能 / 警示）
    // 這四個標籤只有在 result 存在時才會渲染，可驗證 active 版本已被解析成 ScenarioResult。
    expect(screen.getByText('在職人數')).toBeInTheDocument();
    expect(screen.getByText('部門 / 職能')).toBeInTheDocument();
    expect(screen.getByText('警示')).toBeInTheDocument();
  });

  it('只選了 1 個情境（基準）時顯示「請選擇至少 2 個有效版本」提示、不渲染指標表', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });

    // 提示文字
    expect(
      screen.getByText(/請選擇至少 2 個有效版本/),
    ).toBeInTheDocument();

    // 指標對照表標題尚未出現
    expect(screen.queryByText('規劃指標對照')).not.toBeInTheDocument();
  });

  it('情境槽列含「加入情境」可加新槽（最多 4 個）', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });
    // 預設 2 個槽（基準 + 空槽），故仍允許加入
    const addButton = screen.getByRole('button', { name: '加入情境' });
    expect(addButton).toBeInTheDocument();
  });

  it('第二個槽預設為空、含「選擇情境版本」placeholder', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });
    // Radix Select 的 SelectValue 在空值時會顯示 placeholder 文字
    // 預期至少有一個 trigger 顯示「選擇情境版本」
    const placeholders = screen.getAllByText('選擇情境版本');
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });

  it('「移除此情境」鈕：>1 槽時每個槽都出現（含基準槽，第 0 槽亦可刪）', () => {
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });
    // 預設 2 個槽（基準 + 情境 1）。依新規格 canRemove={slots.length > 1}，
    // 兩槽都應該有移除鈕（含基準槽）。
    const removeButtons = screen.queryAllByRole('button', {
      name: '移除此情境',
    });
    expect(removeButtons.length).toBe(2);
  });

  it('R0.4：未達 2 情境時不渲染結構差異卡與「保留事項」行', () => {
    // 預設僅 1 個有效情境（基準）。R0.4 的「保留事項」行屬於結構差異摘要卡，
    // 只在 ≥2 情境時渲染；此處驗證未達門檻時不誤渲染（避免無基準對照時亂報）。
    // 互動切換第二槽（Radix Select）在 jsdom 已知脆弱，且 retained 計算已由
    // scenarioCompare.test.ts 完整覆蓋；此處只做穩定的負向斷言。
    renderWithProviders(<ScenarioComparePage />, { route: '/compare' });

    expect(
      screen.getByText(/請選擇至少 2 個有效版本/),
    ).toBeInTheDocument();
    // 「N% 員工的歸屬維持不變」與「結構差異」摘要皆不應出現。
    expect(screen.queryByText(/員工的歸屬維持不變/)).not.toBeInTheDocument();
    expect(screen.queryByText(/相對基準/)).not.toBeInTheDocument();
  });
});
