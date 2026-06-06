import { renderWithProviders } from '@/test/renderWithProviders';
import { assertNoA11yViolations } from '@/test/axe';
import { PeoplePage } from './PeoplePage';
import { GroupsPage } from './GroupsPage';
import { ChangeLogPage } from './ChangeLogPage';
import { CsvImportPage } from './CsvImportPage';
import { BpmnListPage } from './BpmnListPage';

/**
 * 主要頁面（預設視圖、未開啟對話框）的無障礙基準。
 * 以 renderWithProviders 載入 seed 資料後對渲染結果跑 axe。
 *
 * 已知問題以 it.skip 追蹤，避免讓套件變紅；修復建議見 docs/無障礙稽核報告.md。
 */
describe('頁面無障礙基準', () => {
  it('GroupsPage（組別管理）無違規', async () => {
    const { container } = renderWithProviders(<GroupsPage />, { route: '/groups' });
    await assertNoA11yViolations(container);
  });

  it('ChangeLogPage（調整紀錄）無違規', async () => {
    const { container } = renderWithProviders(<ChangeLogPage />, {
      route: '/changelog',
    });
    await assertNoA11yViolations(container);
  });

  it('CsvImportPage（CSV 匯入）無違規', async () => {
    const { container } = renderWithProviders(<CsvImportPage />, {
      route: '/csv-import',
    });
    await assertNoA11yViolations(container);
  });

  // EmployeeList 狀態篩選 <SelectTrigger> 已補 aria-label。
  it('PeoplePage（人員與歸屬）無違規', async () => {
    const { container } = renderWithProviders(<PeoplePage />, { route: '/' });
    await assertNoA11yViolations(container);
  });

  // 流程列刪除鈕已補 aria-label="刪除流程"、圖示 aria-hidden。
  it('BpmnListPage（BPMN 流程清單）無違規', async () => {
    const { container } = renderWithProviders(<BpmnListPage />, { route: '/bpmn' });
    await assertNoA11yViolations(container);
  });
});
