import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { EmployeeList } from './EmployeeList';

/** 以受控包裝器持有 selectedId，模擬 PeoplePage 使用 EmployeeList 的方式。 */
function Harness({ onAddEmployee = () => {} }: { onAddEmployee?: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <EmployeeList
      selectedId={selectedId}
      onSelect={setSelectedId}
      onAddEmployee={onAddEmployee}
    />
  );
}

describe('EmployeeList 員工清單', () => {
  it('預設列出 seed 在職員工', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('王大明')).toBeInTheDocument();
    expect(screen.getByText('李小華')).toBeInTheDocument();
    // seed 有 12 名在職員工
    const items = screen.getAllByRole('button', { name: /在職/ });
    expect(items.length).toBe(12);
  });

  it('輸入關鍵字可依姓名篩選', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByPlaceholderText('搜尋姓名或工號'), '王大明');
    expect(screen.getByText('王大明')).toBeInTheDocument();
    expect(screen.queryByText('李小華')).not.toBeInTheDocument();
  });

  it('輸入工號可篩選對應員工', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByPlaceholderText('搜尋姓名或工號'), 'E002');
    expect(screen.getByText('李小華')).toBeInTheDocument();
    expect(screen.queryByText('王大明')).not.toBeInTheDocument();
  });

  it('找不到符合的員工時清單為空', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByPlaceholderText('搜尋姓名或工號'), '查無此人');
    expect(screen.queryByRole('button', { name: /在職/ })).not.toBeInTheDocument();
  });

  it('點擊員工會標記為選取（data-active）', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const wang = screen.getByText('王大明').closest('button')!;
    expect(wang).not.toHaveAttribute('data-active');
    await user.click(wang);
    expect(wang).toHaveAttribute('data-active');
  });

  it('點擊「新增員工」會呼叫 onAddEmployee', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<Harness onAddEmployee={onAdd} />);
    await user.click(screen.getByRole('button', { name: /新增員工/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('狀態下拉提供全部／在職／離職選項', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    // EmployeeList 的狀態下拉為第一個 combobox
    await user.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const labels = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['全部', '在職', '離職']));
  });
});
