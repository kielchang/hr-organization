import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { emp, makeOrgData } from '../test/fixtures';
import { EmployeeForm } from './EmployeeForm';

/**
 * EmployeeForm 以 Dialog 呈現新增／編輯員工，直接渲染元件可避開
 * PeoplePage 重用同一表單實例造成的預填問題（見最終報告 bug 註記），
 * 聚焦驗證表單本身的填寫、驗證與儲存流程。
 */
describe('EmployeeForm 員工表單', () => {
  it('開啟後顯示工號、姓名與狀態欄位', async () => {
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('工號')).toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toBeInTheDocument();
    expect(screen.getByLabelText('狀態')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新增員工' })).toBeInTheDocument();
  });

  it('工號與姓名留空儲存時顯示「請填寫工號與姓名」', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={() => {}} onSaved={onSaved} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('請填寫工號與姓名')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('輸入重複工號（與 seed 的 E001 相同）顯示「工號已存在」', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('工號'), 'E001');
    await user.type(screen.getByLabelText('姓名'), '測試員工');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('工號已存在')).toBeInTheDocument();
  });

  it('填入合法工號與姓名後儲存會呼叫 onSaved 與 onClose', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={onClose} onSaved={onSaved} />,
    );
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('工號'), 'E999');
    await user.type(screen.getByLabelText('姓名'), '新進員工');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('點擊「取消」會呼叫 onClose 且不會儲存', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={onClose} onSaved={onSaved} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('編輯模式預填既有員工資料並顯示「編輯員工」標題', async () => {
    const data = makeOrgData({ employees: [emp('e1', { employeeNo: 'A100', name: '王小明' })] });
    renderWithProviders(
      <EmployeeForm
        open
        employee={data.employees[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: '編輯員工' })).toBeInTheDocument();
    expect(screen.getByLabelText('工號')).toHaveValue('A100');
    expect(screen.getByLabelText('姓名')).toHaveValue('王小明');
  });

  it('狀態下拉展開後可看到「在職／離職」選項', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EmployeeForm open employee={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByLabelText('狀態'));
    const listbox = await screen.findByRole('listbox');
    const labels = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(labels).toContain('在職');
    expect(labels).toContain('離職');
  });
});
