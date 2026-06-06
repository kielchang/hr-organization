import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { CsvImportPage } from './CsvImportPage';

const HEADER =
  'employeeNo,employeeName,employeeStatus,groupCode,groupName,parentGroupCode,groupStatus,jobLevelCode,jobLevelName,jobLevelRank,supervisorEmployeeNos,primarySupervisorEmployeeNo,isPrimaryGroup';

const VALID_CSV = [
  HEADER,
  'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
  'E002,李小華,active,HR,人資部,CEO,active,DIR,總監,50,E001,E001,1',
].join('\n');

describe('CsvImportPage CSV 轉 JSON', () => {
  it('顯示三個步驟卡片與必要欄位說明', () => {
    renderWithProviders(<CsvImportPage />);
    expect(screen.getByRole('heading', { name: 'CSV 轉 JSON' })).toBeInTheDocument();
    expect(screen.getByText('1. 準備 CSV')).toBeInTheDocument();
    expect(screen.getByText('2. 預覽與轉換')).toBeInTheDocument();
    expect(screen.getByText(/必要欄位：/)).toBeInTheDocument();
  });

  it('CSV 內容為空時「驗證並預覽」按鈕為停用', () => {
    renderWithProviders(<CsvImportPage />);
    expect(screen.getByRole('button', { name: /驗證並預覽/ })).toBeDisabled();
  });

  it('貼上合法 CSV 後驗證通過，顯示統計與成功訊息', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CsvImportPage />);
    const textarea = screen.getByPlaceholderText(/貼上 CSV 內容/);
    // type 對長字串較慢，直接 paste
    await user.click(textarea);
    await user.paste(VALID_CSV);
    await user.click(screen.getByRole('button', { name: /驗證並預覽/ }));
    expect(
      await screen.findByText('解析與驗證通過，可下載 JSON。'),
    ).toBeInTheDocument();
    // 兩列資料、兩名員工
    expect(screen.getByText(/2 列/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下載 JSON/ })).toBeEnabled();
  });

  it('貼上缺欄位的非法 CSV 後顯示驗證錯誤清單，下載鈕停用', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CsvImportPage />);
    const textarea = screen.getByPlaceholderText(/貼上 CSV 內容/);
    await user.click(textarea);
    await user.paste('employeeNo,employeeName\nE001,王大明');
    await user.click(screen.getByRole('button', { name: /驗證並預覽/ }));
    // 解析或驗證失敗 → 不出現成功訊息，下載鈕停用
    await waitFor(() =>
      expect(
        screen.queryByText('解析與驗證通過，可下載 JSON。'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /下載 JSON/ })).toBeDisabled();
  });

  it('修改 CSV 內容後會清掉先前的預覽結果', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CsvImportPage />);
    const textarea = screen.getByPlaceholderText(/貼上 CSV 內容/);
    await user.click(textarea);
    await user.paste(VALID_CSV);
    await user.click(screen.getByRole('button', { name: /驗證並預覽/ }));
    await screen.findByText('解析與驗證通過，可下載 JSON。');
    // 再輸入任意字元 → 結果區應消失
    await user.type(textarea, 'x');
    expect(
      screen.queryByText('解析與驗證通過，可下載 JSON。'),
    ).not.toBeInTheDocument();
  });
});
