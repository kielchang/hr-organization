import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrgProvider } from '@/context/OrgProvider';
import { BpmnProvider } from '@/context/BpmnProvider';
import { Layout } from './Layout';

/**
 * Layout 側欄導覽結構（旅程優先 IA 整併後）：
 * - 三區分層：主要（總覽／工作台／人員與歸屬／組別管理）→ 次要「分析與紀錄」
 *   （健檢／比較／變更影響／調整紀錄）→ 頁尾 meta（CSV 匯入／Roadmap）。
 * - 「組織圖（/org-chart）」項已移除（併入工作台第 3 視角「組別歸屬圖」）。
 *
 * 以 Routes 包裹是因為 Layout 透過 <Outlet /> 渲染子頁面（此處掛一個極簡子頁占位）。
 */
function renderLayout(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <OrgProvider>
        <BpmnProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<h2>頁面內容</h2>} />
            </Route>
          </Routes>
        </BpmnProvider>
      </OrgProvider>
    </MemoryRouter>,
  );
}

describe('Layout 側欄導覽結構', () => {
  it('主要區四項導覽連結皆在（總覽／工作台／人員與歸屬／組別管理）', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');

    expect(
      within(nav).getByRole('link', { name: '總覽' }),
    ).toHaveAttribute('href', '/');
    expect(
      within(nav).getByRole('link', { name: '工作台' }),
    ).toHaveAttribute('href', '/workbench');
    expect(
      within(nav).getByRole('link', { name: '人員與歸屬' }),
    ).toHaveAttribute('href', '/people');
    expect(
      within(nav).getByRole('link', { name: '組別管理' }),
    ).toHaveAttribute('href', '/groups');
  });

  it('次要區帶有「分析與紀錄」小標題與其四項連結（健檢／比較／變更影響／調整紀錄）', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');

    // 次要區小標題文字（非 landmark／非 heading，純視覺分組標籤）。
    expect(within(nav).getByText('分析與紀錄')).toBeInTheDocument();

    expect(
      within(nav).getByRole('link', { name: '規劃健檢' }),
    ).toHaveAttribute('href', '/health');
    expect(
      within(nav).getByRole('link', { name: '情境比較' }),
    ).toHaveAttribute('href', '/compare');
    expect(
      within(nav).getByRole('link', { name: '變更影響' }),
    ).toHaveAttribute('href', '/bpmn/impact');
    expect(
      within(nav).getByRole('link', { name: '調整紀錄' }),
    ).toHaveAttribute('href', '/changelog');
  });

  it('頁尾 meta 區兩項連結皆在（CSV 匯入／改善 Roadmap）', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');

    expect(
      within(nav).getByRole('link', { name: 'CSV 匯入' }),
    ).toHaveAttribute('href', '/csv-import');
    expect(
      within(nav).getByRole('link', { name: '改善 Roadmap' }),
    ).toHaveAttribute('href', '/roadmap');
  });

  it('「組織圖」項已移除：側欄無此連結、亦無指向 /org-chart 的連結', () => {
    renderLayout();
    const nav = screen.getByRole('navigation');

    // 不應再有以「組織圖」為名的側欄連結（已併入工作台第 3 視角）。
    expect(
      within(nav).queryByRole('link', { name: '組織圖' }),
    ).not.toBeInTheDocument();

    // 側欄任一連結都不應指向 /org-chart（該路由現為重導向、不掛側欄項）。
    const orgChartLinks = within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/org-chart');
    expect(orgChartLinks).toHaveLength(0);
  });
});
