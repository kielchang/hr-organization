import { useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { useOrg } from '../context/useOrg';
import { ChangeLogPage } from './ChangeLogPage';

/** 在掛載時觸發一次變更，讓 changeLog 產生紀錄供 ChangeLogPage 呈現。 */
function SeedChange({ kind }: { kind: 'employee' | 'assignmentUpdate' }) {
  const { saveEmployee, saveAssignment, data } = useOrg();
  useEffect(() => {
    if (kind === 'employee') {
      saveEmployee(
        { id: 'e_new', employeeNo: 'E777', name: '測試新人', status: 'active' },
        true,
      );
    } else {
      // 更新既有歸屬 a1（會寫入 before/after，供 Diff 檢視）
      const a1 = data.assignments.find((a) => a.id === 'a1');
      if (a1) saveAssignment({ ...a1, jobLevelId: 'jl1' }, false);
    }
    // 僅需於掛載時執行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('ChangeLogPage 調整紀錄', () => {
  it('無任何變更時顯示「尚無調整紀錄」', () => {
    renderWithProviders(<ChangeLogPage />);
    expect(screen.getByText('尚無調整紀錄')).toBeInTheDocument();
  });

  it('新增員工後，紀錄表列出該筆變更與類型標籤', async () => {
    renderWithProviders(
      <>
        <SeedChange kind="employee" />
        <ChangeLogPage />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByText('新增員工：測試新人')).toBeInTheDocument(),
    );
    // 類型欄顯示中文標籤
    const row = screen.getByText('新增員工：測試新人').closest('tr')!;
    expect(within(row).getByText('新增員工')).toBeInTheDocument();
    // 純新增不含 before/after → 無「檢視」鈕
    expect(within(row).queryByRole('button', { name: '檢視' })).not.toBeInTheDocument();
  });

  it('更新歸屬產生 before/after，可開啟 Diff 對話框檢視前後內容', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SeedChange kind="assignmentUpdate" />
        <ChangeLogPage />
      </>,
    );
    const viewButton = await screen.findByRole('button', { name: '檢視' });
    await user.click(viewButton);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('變更內容')).toBeInTheDocument();
    expect(within(dialog).getByText('變更前')).toBeInTheDocument();
    expect(within(dialog).getByText('變更後')).toBeInTheDocument();
  });
});
