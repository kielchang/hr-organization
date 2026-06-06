import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { PeoplePage } from './PeoplePage';

describe('PeoplePage 人員與歸屬', () => {
  it('預設選取第一名員工並顯示其姓名與工號', () => {
    renderWithProviders(<PeoplePage />);
    const heading = screen.getByRole('heading', { name: '王大明' });
    expect(heading).toBeInTheDocument();
    // 詳情標頭區（與姓名同一容器）帶出工號
    expect(within(heading.parentElement!).getByText('E001')).toBeInTheDocument();
  });

  it('點選清單中的其他員工會切換右側詳情', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PeoplePage />);
    // 點清單中的李小華（清單按鈕）
    const listButton = screen.getByText('李小華').closest('button')!;
    await user.click(listButton);
    expect(screen.getByRole('heading', { name: '李小華' })).toBeInTheDocument();
  });

  it('顯示所選員工的組別歸屬資訊（職級、主管）', () => {
    renderWithProviders(<PeoplePage />);
    // e1 王大明 在 g1 總經理室，職級總監，無主管 → 主管顯示「—」
    expect(screen.getByText(/總經理室/)).toBeInTheDocument();
    expect(screen.getByText('職級：總監')).toBeInTheDocument();
  });

  it('點擊「新增歸屬」會出現歸屬編輯卡片與儲存鈕', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PeoplePage />);
    await user.click(screen.getByRole('button', { name: /新增歸屬/ }));
    // 編輯器顯示組別／職級下拉與儲存鈕
    expect(screen.getByText('組別')).toBeInTheDocument();
    expect(screen.getByText('職級')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /儲存/ }).length).toBeGreaterThan(0);
  });

  it('點擊歸屬上的「編輯」會展開編輯器，取消後恢復', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PeoplePage />);
    await user.click(screen.getByRole('button', { name: '編輯' }));
    // 編輯器中的取消圖示鈕
    const cancel = await screen.findByRole('button', { name: '取消' });
    await user.click(cancel);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument(),
    );
  });

  it('刪除員工時若於 confirm 取消則不會刪除', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<PeoplePage />);
    // 員工刪除鈕位於姓名標頭區，與「編輯員工」同列
    const header = screen.getByRole('heading', { name: '王大明' }).parentElement!;
    await user.click(within(header).getByRole('button', { name: '刪除' }));
    expect(confirmSpy).toHaveBeenCalledWith('確定刪除 王大明？');
    // 取消後王大明仍在
    expect(screen.getByRole('heading', { name: '王大明' })).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('於 confirm 確認後刪除員工，右側切換至下一名員工', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<PeoplePage />);
    const header = screen.getByRole('heading', { name: '王大明' }).parentElement!;
    await user.click(within(header).getByRole('button', { name: '刪除' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '王大明' })).not.toBeInTheDocument(),
    );
    confirmSpy.mockRestore();
  });

  it('新增歸屬編輯器選好組別與職級後可成功儲存並回到列表', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PeoplePage />);
    await user.click(screen.getByRole('button', { name: /新增歸屬/ }));
    // 將範圍限定在歸屬編輯卡片內（含「設為主組別」），避開 EmployeeList 的狀態篩選下拉
    const editorCard = screen
      .getByText('設為主組別')
      .closest('[data-slot="card"]') as HTMLElement;
    const [groupTrigger, jobLevelTrigger] = within(editorCard).getAllByRole('combobox');
    await user.click(groupTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '行銷部' }),
    );
    await user.click(jobLevelTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '專員' }),
    );
    await user.click(within(editorCard).getByRole('button', { name: /儲存/ }));
    // 儲存後新歸屬卡片應列出行銷部
    await waitFor(() => expect(screen.getByText(/行銷部/)).toBeInTheDocument());
  });
});
