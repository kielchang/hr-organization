import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { RoadmapPage } from './RoadmapPage';

/**
 * RoadmapPage render smoke：以 renderWithProviders 載入 hard-coded roadmap 資料掛載整頁，
 * 確認契約 §3 規定的關鍵區塊（頁首、vibe 警告、phase cards、紅線、訪談問題）皆出現，
 * 且渲染期間無 console.error。
 *
 * 本頁不使用 React Flow，jsdom 可直接掛載。
 */
describe('RoadmapPage render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現契約規定的關鍵區塊，且無 console.error', () => {
    renderWithProviders(<RoadmapPage />, { route: '/roadmap' });

    // 1. 頁首 — 標題（副標）出現 + 「改善 Roadmap」 caption
    expect(
      screen.getByRole('heading', {
        name: /綜合 PM、UXR、變革管理顧問三方評審後的改善方向/,
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('改善 Roadmap').length).toBeGreaterThan(0);

    // 2. 狀態總覽橫條：6 個小卡標籤
    // 「已完成 / 已排程 / 待訪談 / 觀察中」這些文字會同時出現在 StatCard 標籤與
    // 狀態徽章中（StatCard label + Badge label 共用語彙），用 getAllByText。
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已排程').length).toBeGreaterThan(0);
    expect(screen.getAllByText('待訪談').length).toBeGreaterThan(0);
    expect(screen.getAllByText('觀察中').length).toBeGreaterThan(0);
    // 「進行中 / 合計」只出現在 StatCard 標籤裡，可用 getByText。
    expect(screen.getByText('進行中')).toBeInTheDocument();
    expect(screen.getByText('合計')).toBeInTheDocument();

    // 3. vibe 警告 callout（CM 顧問核心警告 — 出現「高估自己」與「30%」字樣）
    // 「高估自己」只在 vibe callout 標題；「30%」會同時出現在 callout 內文與
    // phase-0 描述，用 getAllByText 確認至少出現一次。
    expect(screen.getByText(/高估自己/)).toBeInTheDocument();
    expect(screen.getAllByText(/30%/).length).toBeGreaterThan(0);

    // 4. 至少一個 phase 標題出現（例 Phase 0 vibe 校準）
    expect(screen.getByText(/Phase 0\s*[—-]\s*vibe 校準/)).toBeInTheDocument();

    // 5. 至少一個已完成 commit hash 出現（例 13f5d4a — 雙維度）
    expect(screen.getByText('13f5d4a')).toBeInTheDocument();

    // 6. 紅線 callout 出現
    expect(screen.getByText(/紅線/)).toBeInTheDocument();

    // 7. 訪談問題清單出現（標題 + 至少其中一個問題）
    expect(
      screen.getByText(/訪談真實 HR 才能驗證的 8 個關鍵問題/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/組織調整你先打開 Excel 還是工具/),
    ).toBeInTheDocument();

    // 渲染期間不應有 React 錯誤/警告
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('Roadmap 階段 section 與狀態總覽 section 皆有適當 aria-label', () => {
    renderWithProviders(<RoadmapPage />, { route: '/roadmap' });

    // section 以 aria-label 對使用者輔具公開語意
    expect(
      screen.getByRole('region', { name: '狀態總覽' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Roadmap 階段' }),
    ).toBeInTheDocument();
  });
});
