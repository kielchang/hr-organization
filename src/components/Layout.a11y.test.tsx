import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { assertNoA11yViolations } from '@/test/axe';
import { OrgProvider } from '@/context/OrgProvider';
import { BpmnProvider } from '@/context/BpmnProvider';
import { Layout } from './Layout';

/**
 * Layout 含側邊導覽（nav landmark）、主內容（main landmark）與資料工具列。
 * 以 Routes 包裹是因為 Layout 透過 <Outlet /> 渲染子頁面。
 */
function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
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

describe('Layout 無障礙', () => {
  it('導覽與主框架無違規（landmark／連結可及名稱）', async () => {
    const { container } = renderLayout();
    await assertNoA11yViolations(container);
  });
});
