import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { group, makeOrgData } from '../test/fixtures';
import { GroupForm } from './GroupForm';

/** GroupForm 以 Dialog 呈現新增／編輯組別，含代碼／名稱必填與重複代碼驗證。 */
describe('GroupForm 組別表單', () => {
  it('開啟後顯示代碼、名稱、上層組別與狀態欄位', async () => {
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('代碼')).toBeInTheDocument();
    expect(screen.getByLabelText('名稱')).toBeInTheDocument();
    expect(screen.getByLabelText('上層組別')).toBeInTheDocument();
    expect(screen.getByLabelText('狀態')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新增組別' })).toBeInTheDocument();
  });

  it('代碼與名稱留空儲存時顯示「請填寫代碼與名稱」', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={() => {}} onSaved={onSaved} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('請填寫代碼與名稱')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('輸入重複代碼（與 seed 的 CEO 相同）顯示「組別代碼已存在」', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('代碼'), 'CEO');
    await user.type(screen.getByLabelText('名稱'), '重複部門');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('組別代碼已存在')).toBeInTheDocument();
  });

  it('填入合法代碼與名稱後儲存會呼叫 onSaved', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={() => {}} onSaved={onSaved} />,
    );
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('代碼'), 'NEWDEPT');
    await user.type(screen.getByLabelText('名稱'), '新部門');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('點擊「取消」會呼叫 onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={onClose} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('編輯模式預填既有組別資料並顯示「編輯組別」標題', async () => {
    const data = makeOrgData({
      groups: [group('g1', { code: 'RD', name: '研發部' })],
    });
    renderWithProviders(
      <GroupForm
        open
        group={data.groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: '編輯組別' })).toBeInTheDocument();
    expect(screen.getByLabelText('代碼')).toHaveValue('RD');
    expect(screen.getByLabelText('名稱')).toHaveValue('研發部');
  });

  it('上層組別下拉提供「（無）」選項與其他組別', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <GroupForm open group={null} isNew onClose={() => {}} onSaved={() => {}} />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByLabelText('上層組別'));
    const listbox = await screen.findByRole('listbox');
    const labels = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(labels).toContain('（無）');
    expect(labels).toContain('總經理室');
  });
});
