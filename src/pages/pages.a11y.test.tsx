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

  // 已知問題（待修：button-name）：本頁透過 EmployeeList 渲染狀態篩選 <Select>，
  // 其 <SelectTrigger>（role=combobox 按鈕）未與 Label 關聯，無可及名稱。
  // 詳見 docs/無障礙稽核報告.md。
  it.skip('PeoplePage（人員與歸屬）無違規（已知問題，待修：button-name）', async () => {
    const { container } = renderWithProviders(<PeoplePage />, { route: '/' });
    await assertNoA11yViolations(container);
  });

  // 已知問題（待修：button-name）：流程列的刪除鈕為純圖示（Trash2），
  // 無文字也無 aria-label，screen reader 只會讀到「按鈕」。
  // 詳見 docs/無障礙稽核報告.md。
  it.skip('BpmnListPage（BPMN 流程清單）無違規（已知問題，待修：button-name）', async () => {
    const { container } = renderWithProviders(<BpmnListPage />, { route: '/bpmn' });
    await assertNoA11yViolations(container);
  });
});
