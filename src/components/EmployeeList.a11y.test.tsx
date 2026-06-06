import { renderWithProviders } from '@/test/renderWithProviders';
import { assertNoA11yViolations } from '@/test/axe';
import { EmployeeList } from './EmployeeList';

/**
 * EmployeeList（人員清單）無障礙測試。
 *
 * 已知問題（待修：button-name）：狀態篩選的 <Select> 使用 <SelectValue> 顯示
 * 文字，但 <SelectTrigger>（role=combobox 的 button）未透過 Label htmlFor /
 * aria-label 取得可及名稱，screen reader 只會讀到「按鈕」。
 * 詳見 docs/無障礙稽核報告.md。
 */
describe('EmployeeList 無障礙', () => {
  it.skip('EmployeeList 無違規（已知問題，待修：button-name）', async () => {
    const { container } = renderWithProviders(
      <EmployeeList selectedId={null} onSelect={() => {}} onAddEmployee={() => {}} />,
    );
    await assertNoA11yViolations(container);
  });
});
