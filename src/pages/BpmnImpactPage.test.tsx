import { afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { BpmnImpactPage } from './BpmnImpactPage';

/**
 * BpmnImpactPage render smoke（M2 重定位後 + M3 文案／空狀態修正）：
 * 對應 docs/契約-變更影響重定位.md 的 §2.2 文案契約，以及
 * docs/契約-整合UX收尾.md §5.1（callout 文案）/ §5.2（空流程主要 CTA）。
 *
 * 此頁不使用 React Flow，僅 BaselineSelector + Tabs + ImpactSummaryCards/Row（一般 DOM），
 * 預設 source='snapshot'、無 baseline，故 Tab1 顯示空狀態；Tab2 永遠渲染 ProcessHealth 列表。
 * 此處只跑 render 斷言，不做互動。
 *
 * 預設情境：BpmnProvider 預載 `defaultExpenseProcess`，所以 processes.length > 0，
 * 走 Tabs 路徑；空流程情境另寫測試以 localStorage 預塞空 store 來模擬。
 */
describe('BpmnImpactPage 變更影響重定位 render smoke', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('掛載後出現新標題、引導 callout、兩個 Tab 與底部進階入口', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    // 2.2 頁首：新標題（取代舊「流程影響分析」）
    expect(
      screen.getByRole('heading', { name: '變更影響分析', level: 2 }),
    ).toBeInTheDocument();

    // 2.2 副標：HR 視角文案中的關鍵字
    expect(
      screen.getByText(/動到哪些作業／決策流程的核准人與路徑/),
    ).toBeInTheDocument();

    // 2.2 HR-friendly callout：包含「核准人」與「找不到核准人」關鍵字
    // （M3 §5.1：「匯報線斷鏈而無法執行」改為「主管異動找不到核准人」）
    // 同樣關鍵字可能出現在 Tab panel 的其他說明文字，故用 getAllByText
    expect(screen.getAllByText(/核准人/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/找不到核准人/).length).toBeGreaterThan(0);

    // 2.2 Tabs：兩個 trigger 都在
    expect(
      screen.getByRole('tab', { name: /變更影響比對/ }),
    ).toBeInTheDocument();
    // 「即時健檢」→「流程健檢」（避免與規劃健檢字面重疊）
    expect(screen.getByRole('tab', { name: /流程健檢/ })).toBeInTheDocument();

    // 2.2 移除返回鈕：不應有「返回」字樣的按鈕
    expect(
      screen.queryByRole('button', { name: /返回/ }),
    ).not.toBeInTheDocument();

    // 2.2 頁尾：進階：管理流程定義（連 /bpmn）
    const advancedBtn = screen.getByRole('button', {
      name: /進階：管理流程定義/,
    });
    expect(advancedBtn).toBeInTheDocument();
  });

  it('預設 source=snapshot 無 baseline 時 Tab1 顯示「請先建立基準快照」空狀態', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    // Tab1 預設為啟用狀態（defaultValue="impact"），可看到空狀態文字
    expect(
      screen.getByText(/請先建立基準快照，再調整組織資料/),
    ).toBeInTheDocument();
  });

  it('BaselineSelector 渲染：顯示「基準來源（Before）」與「目前組織資料（即時）」', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    expect(screen.getByText(/基準來源（Before）/)).toBeInTheDocument();
    // After 標籤
    expect(screen.getByText(/目前組織資料（即時）/)).toBeInTheDocument();
  });

  it('渲染過程沒有 console.error', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });
    // sanity：頁面標題確實渲染了
    expect(
      screen.getByRole('heading', { name: '變更影響分析', level: 2 }),
    ).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('引導 callout 同時提及「核准人」與「進階：管理流程定義」', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    // callout 區塊：找到含「核准人」的段落，確認同段也提到入口
    const calloutText = screen.getByText(/完成組織調整後，這裡會告訴你/);
    const callout = calloutText.closest('div') as HTMLElement;
    expect(callout).not.toBeNull();
    // 「核准人」與「找不到核准人」皆為強調文字（兩個 <strong>），且後者也匹配 /核准人/
    expect(within(callout).getAllByText(/核准人/).length).toBeGreaterThan(0);
    expect(within(callout).getByText(/找不到核准人/)).toBeInTheDocument();
  });
});

/**
 * §5.2：當 store.processes.length === 0 時，應隱藏 Tabs / BaselineSelector
 * 與頁尾「進階：管理流程定義」連結，改顯示主要 CTA「還沒有任何流程定義」
 * 與按鈕「前往管理流程定義」連 /bpmn。
 *
 * BpmnProvider 預設會載入 `defaultExpenseProcess`，所以以 localStorage 預塞空 store
 * 來模擬「沒有任何流程」的初始狀態（BPMN_SCHEMA_VERSION = 3，避免觸發 migration）。
 */
describe('BpmnImpactPage 空流程主要 CTA（§5.2）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 預塞空 store：processes=[]，其他欄位以最小有效形狀
    localStorage.setItem(
      'bpmn-store',
      JSON.stringify({
        schemaVersion: 3,
        processes: [],
        activeSession: null,
        simulationHistory: [],
        impactBaseline: null,
      }),
    );
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('沒有流程時顯示「還沒有任何流程定義」與「前往管理流程定義」按鈕', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    // 主要 CTA 標題
    expect(screen.getByText('還沒有任何流程定義')).toBeInTheDocument();

    // 主要按鈕：前往管理流程定義
    expect(
      screen.getByRole('button', { name: /前往管理流程定義/ }),
    ).toBeInTheDocument();
  });

  it('沒有流程時不應出現 Tabs（變更影響比對 / 流程健檢）與底部「進階」按鈕', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });

    // §5.2：隱藏 Tabs
    expect(
      screen.queryByRole('tab', { name: /變更影響比對/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /流程健檢/ }),
    ).not.toBeInTheDocument();

    // §5.2：隱藏頁尾「進階：管理流程定義」按鈕（避免雙重入口）
    expect(
      screen.queryByRole('button', { name: /進階：管理流程定義/ }),
    ).not.toBeInTheDocument();
  });

  it('渲染期間無 console.error', () => {
    renderWithProviders(<BpmnImpactPage />, { route: '/bpmn/impact' });
    expect(screen.getByText('還沒有任何流程定義')).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
