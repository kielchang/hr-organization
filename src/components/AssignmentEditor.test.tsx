import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { createEmptyAssignment } from '../services/orgOperations';
import type { Assignment } from '../types/org';
import { AssignmentEditor } from './AssignmentEditor';

/** 對 seed 員工 e1（王大明）建立新歸屬草稿。 */
function draftFor(employeeId = 'e1'): Assignment {
  return createEmptyAssignment(employeeId);
}

describe('AssignmentEditor 歸屬編輯器', () => {
  it('新歸屬未選組別／職級時儲存顯示驗證錯誤', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor()}
        isNew
        onSaved={onSaved}
        onCancel={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /儲存/ }));
    // 缺組別與職級會合併多條錯誤訊息（以「；」串接）
    expect(await screen.findByText(/找不到組別/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('選好組別與職級後可成功儲存並呼叫 onSaved', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor()}
        isNew
        onSaved={onSaved}
        onCancel={() => {}}
      />,
    );
    // 第一個下拉為組別，第二個為職級
    const [groupTrigger, jobLevelTrigger] = screen.getAllByRole('combobox');
    await user.click(groupTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '行銷部' }),
    );
    await user.click(jobLevelTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '專員' }),
    );
    await user.click(screen.getByRole('button', { name: /儲存/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('勾選主管後會出現「主主管」下拉', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor()}
        isNew
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText('主主管')).not.toBeInTheDocument();
    // 勾選一名主管（李小華）
    await user.click(screen.getByRole('checkbox', { name: '李小華' }));
    expect(await screen.findByText('主主管')).toBeInTheDocument();
  });

  it('在同一組別重複歸屬會顯示「同一員工在此組別已有歸屬紀錄」', async () => {
    const user = userEvent.setup();
    // seed: e1 已在 g1（總經理室）有歸屬，故再選總經理室應衝突
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor('e1')}
        isNew
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    );
    const [groupTrigger, jobLevelTrigger] = screen.getAllByRole('combobox');
    await user.click(groupTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '總經理室' }),
    );
    await user.click(jobLevelTrigger);
    await user.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: '專員' }),
    );
    await user.click(screen.getByRole('button', { name: /儲存/ }));
    expect(
      await screen.findByText(/同一員工在此組別已有歸屬紀錄/),
    ).toBeInTheDocument();
  });

  it('點擊取消圖示鈕會呼叫 onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor()}
        isNew
        onSaved={() => {}}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('主管清單不包含員工本人', () => {
    renderWithProviders(
      <AssignmentEditor
        assignment={draftFor('e1')}
        isNew
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    );
    // e1 為王大明，本人不應出現在可勾選主管清單中
    expect(
      screen.queryByRole('checkbox', { name: '王大明' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '李小華' })).toBeInTheDocument();
  });
});
