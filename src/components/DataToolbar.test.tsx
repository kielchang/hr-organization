import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { DataToolbar } from './DataToolbar';

describe('DataToolbar 資料工具列', () => {
  it('顯示操作者輸入框（預設 HR User）並可修改', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataToolbar />);
    const operatorInput = screen.getByLabelText('操作者') as HTMLInputElement;
    expect(operatorInput).toHaveValue('HR User');
    await user.clear(operatorInput);
    await user.type(operatorInput, '王經理');
    expect(operatorInput).toHaveValue('王經理');
  });

  it('顯示資料版本選擇器與相關匯入匯出按鈕', () => {
    renderWithProviders(<DataToolbar />);
    expect(screen.getByLabelText('資料版本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /匯出目前資料/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /從檔案載入/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /匯出發布版本/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /匯入發布版本/ })).toBeInTheDocument();
  });

  it('版本選擇器顯示驗證徽章並可展開選單', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DataToolbar />);
    // 內建 seed 版本應驗證通過
    expect(screen.getByText('驗證通過')).toBeInTheDocument();
    await user.click(screen.getByLabelText('資料版本'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThanOrEqual(1);
  });
});
