import { renderWithProviders } from '@/test/renderWithProviders';
import { assertNoA11yViolations } from '@/test/axe';
import { EmployeeList } from './EmployeeList';

/**
 * EmployeeList（人員清單）無障礙測試。
 * 狀態篩選的 <SelectTrigger> 已加上 aria-label，screen reader 可讀到可及名稱。
 */
describe('EmployeeList 無障礙', () => {
  it('EmployeeList 無違規', async () => {
    const { container } = renderWithProviders(
      <EmployeeList selectedId={null} onSelect={() => {}} onAddEmployee={() => {}} />,
    );
    await assertNoA11yViolations(container);
  });
});
