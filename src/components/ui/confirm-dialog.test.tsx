import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog 確認對話框', () => {
  it('開啟時顯示標題、說明與自訂按鈕文字', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="刪除此版本？"
        description="此動作無法復原。"
        confirmLabel="確定刪除"
        cancelLabel="先不要"
        onConfirm={() => {}}
      />,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('刪除此版本？')).toBeInTheDocument();
    expect(screen.getByText('此動作無法復原。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確定刪除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '先不要' })).toBeInTheDocument();
  });

  it('點擊確認會呼叫 onConfirm 並關閉（onOpenChange(false)）', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="確認"
        description="確認嗎？"
        onConfirm={onConfirm}
      />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '確定' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('點擊取消只關閉，不呼叫 onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="確認"
        description="確認嗎？"
        onConfirm={onConfirm}
      />,
    );
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('open 為 false 時不顯示對話框', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="確認"
        description="確認嗎？"
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
