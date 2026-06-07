import { afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditModeToolbar } from './EditModeToolbar';
import type { EditSession } from '../../types/editSession';

/**
 * EditModeToolbar 的 R0.1「發布摩擦」三題（CM nudge）測試。
 *
 * EditModeToolbar 為純展示元件（plain props，不依賴 React Flow context），
 * 可直接以最小 props 掛載。聚焦驗證：
 *  - 編輯模式下「發布」對話框含三個選填問題
 *  - 任一題空白時顯示柔性提醒（warning callout）；三題填妥後提醒消失
 *  - 三題不阻擋發布：全空與全填皆能呼叫 onPublish
 *  - 對話框關閉後三題 state 重置（重開仍為提醒狀態）
 *
 * 不重測 ConfirmDialog 本體（已由 confirm-dialog.test.tsx 覆蓋）。
 */

/** 最小編輯中 session（snapshots 空即可，三題與 snapshot 無關）。 */
function makeSession(): EditSession {
  return {
    baseline: {
      schemaVersion: 1,
      contentVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      employees: [],
      groups: [],
      jobLevels: [],
      assignments: [],
      changeLog: [],
    },
    snapshots: [],
  } as unknown as EditSession;
}

/** 以編輯模式渲染並回傳常用 props spy。 */
function renderEditing() {
  const onPublish = vi.fn();
  render(
    <EditModeToolbar
      isEditMode
      session={makeSession()}
      showSnapshotPanel={false}
      onEnterEditMode={() => {}}
      onExitEditMode={() => {}}
      onSaveCheckpoint={() => {}}
      onPublish={onPublish}
      onToggleSnapshotPanel={() => {}}
    />,
  );
  return { onPublish };
}

const NUDGE_TEXT = /組織調整的成敗多半取決於「人的一面」/;

describe('EditModeToolbar — R0.1 發布摩擦三題（CM nudge）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('編輯模式發布對話框：含三個選填問題且空白時顯示柔性提醒', async () => {
    const user = userEvent.setup();
    renderEditing();

    await user.click(screen.getByRole('button', { name: '發布' }));
    const dialog = await screen.findByRole('dialog');
    const inDialog = within(dialog);

    // 三題標籤
    expect(
      inDialog.getByText('這次調整的 sponsor（高層支持者）是誰？'),
    ).toBeInTheDocument();
    expect(
      inDialog.getByText('主要受影響的關鍵人員／單位有哪些？'),
    ).toBeInTheDocument();
    expect(
      inDialog.getByText('落地後的追蹤負責人（sustainment owner）是誰？'),
    ).toBeInTheDocument();

    // 三題皆空 → 顯示柔性提醒（warning callout，不是錯誤）
    expect(inDialog.getByText(NUDGE_TEXT)).toBeInTheDocument();
    // 仍可發布（按鈕未被禁用）
    expect(
      inDialog.getByRole('button', { name: '確定發布' }),
    ).toBeEnabled();
  });

  it('三題全部填妥後柔性提醒消失', async () => {
    const user = userEvent.setup();
    renderEditing();

    await user.click(screen.getByRole('button', { name: '發布' }));
    const dialog = await screen.findByRole('dialog');
    const inDialog = within(dialog);

    await user.type(inDialog.getByLabelText(/sponsor/), '王小明');
    await user.type(
      inDialog.getByLabelText('主要受影響的關鍵人員／單位有哪些？'),
      '業務一部',
    );
    await user.type(
      inDialog.getByLabelText(/sustainment owner/),
      '李小華',
    );

    expect(inDialog.queryByText(NUDGE_TEXT)).not.toBeInTheDocument();
  });

  it('三題全空也能發布（nudge 不阻擋），且不送出三題的值', async () => {
    const user = userEvent.setup();
    const { onPublish } = renderEditing();

    await user.click(screen.getByRole('button', { name: '發布' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '確定發布' }));

    // 生效日留空 → onPublish(undefined)；三題不進入發布參數（純 nudge）
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledWith(undefined);
  });

  it('三題填妥後發布行為不變（仍呼叫 onPublish，參數與既有相同）', async () => {
    const user = userEvent.setup();
    const { onPublish } = renderEditing();

    await user.click(screen.getByRole('button', { name: '發布' }));
    const dialog = await screen.findByRole('dialog');
    const inDialog = within(dialog);

    await user.type(inDialog.getByLabelText(/sponsor/), '王小明');
    await user.type(
      inDialog.getByLabelText('主要受影響的關鍵人員／單位有哪些？'),
      '業務一部',
    );
    await user.type(inDialog.getByLabelText(/sustainment owner/), '李小華');
    await user.click(inDialog.getByRole('button', { name: '確定發布' }));

    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledWith(undefined);
  });

  it('對話框關閉再開啟：三題 state 重置（重開仍顯示柔性提醒）', async () => {
    const user = userEvent.setup();
    renderEditing();

    // 第一次開啟並填一題
    await user.click(screen.getByRole('button', { name: '發布' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/sponsor/), '王小明');
    // 取消關閉
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    // 重新開啟 → sponsor 欄應已清空、且柔性提醒再次出現
    await user.click(screen.getByRole('button', { name: '發布' }));
    dialog = await screen.findByRole('dialog');
    const inDialog = within(dialog);
    expect(inDialog.getByLabelText(/sponsor/)).toHaveValue('');
    expect(inDialog.getByText(NUDGE_TEXT)).toBeInTheDocument();
  });
});
