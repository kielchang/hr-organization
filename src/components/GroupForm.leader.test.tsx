import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupForm } from './GroupForm';
import type { OrgContextValue } from '../context/orgContextState';
import type { Group } from '../types/org';
import { assignment, emp, group, makeOrgData } from '../test/fixtures';

/**
 * GroupForm 組長下拉（Phase B）聚焦測試。
 *
 * 與 GroupForm.test.tsx（用真 OrgProvider + seed）不同，此檔以 module mock 隔離
 * useOrg，注入受控的 data 與一個 vi.fn() saveGroup，以便：
 *  - 精準斷言 saveGroup 收到的 group 參數含正確的 leaderId（選定/未指定/null）。
 *  - 自由控制「該組有無成員」以驗證下拉停用態。
 *
 * 組長候選＝該組現有成員（對應 groupId 的 assignment 所指向員工）。
 * sentinel `__none__`＝「未指定」→ 寫回 leaderId=null。無成員時下拉停用。
 */

const useOrgMock = vi.fn<() => OrgContextValue>();

vi.mock('../context/useOrg', () => ({
  useOrg: () => useOrgMock(),
}));

/** 最近一次 saveGroup 呼叫；由各案例斷言。 */
let saveGroupMock: ReturnType<typeof vi.fn>;

/**
 * 注入受控 OrgContext：data 為傳入的 OrgData、saveGroup 為可斷言的 mock。
 * 其餘欄位元件不讀，以 partial cast 提供（對齊 CloudSyncBanner.test 風格）。
 */
function mockOrg(data: ReturnType<typeof makeOrgData>) {
  saveGroupMock = vi.fn().mockReturnValue(null); // null＝儲存成功（無錯誤訊息）
  useOrgMock.mockReturnValue({
    data,
    saveGroup: saveGroupMock,
  } as unknown as OrgContextValue);
}

/** 造一個帶兩名成員（amy/bob）的部門組，供組長下拉有候選可選。 */
function orgWithMembers(groupOverride: Partial<Group> = {}) {
  return makeOrgData({
    employees: [emp('amy', { name: '艾美' }), emp('bob', { name: '巴布' })],
    groups: [group('g1', { code: 'RD', name: '研發部', ...groupOverride })],
    assignments: [
      assignment('as-amy', { employeeId: 'amy', groupId: 'g1' }),
      assignment('as-bob', { employeeId: 'bob', groupId: 'g1' }),
    ],
  });
}

/** 取得「組長」下拉的 trigger（以 label 關聯）。 */
function leaderTrigger() {
  return screen.getByLabelText('組長');
}

describe('GroupForm — 組長下拉（Phase B）', () => {
  beforeEach(() => {
    useOrgMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('有成員時：組長下拉可開啟並列出「未指定」＋各成員', async () => {
    const user = userEvent.setup();
    mockOrg(orgWithMembers());
    render(
      <GroupForm
        open
        group={orgWithMembers().groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');

    const trigger = leaderTrigger();
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(trigger);

    const listbox = await screen.findByRole('listbox');
    const labels = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim());
    expect(labels).toContain('未指定');
    expect(labels).toContain('艾美');
    expect(labels).toContain('巴布');
  });

  it('選定某成員為組長 → saveGroup 收到含該 leaderId 的 group', async () => {
    const user = userEvent.setup();
    mockOrg(orgWithMembers());
    const onSaved = vi.fn();
    render(
      <GroupForm
        open
        group={orgWithMembers().groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    await screen.findByRole('dialog');

    await user.click(leaderTrigger());
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '巴布' }));

    await user.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(saveGroupMock).toHaveBeenCalledTimes(1));
    const [savedGroup, isNew] = saveGroupMock.mock.calls[0];
    expect(savedGroup.leaderId).toBe('bob');
    expect(savedGroup.id).toBe('g1');
    expect(isNew).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('已設組長者改選「未指定」→ saveGroup 收到 leaderId=null', async () => {
    const user = userEvent.setup();
    // 初始 group 已有 leaderId=amy，改選「未指定」應寫回 null。
    mockOrg(orgWithMembers({ leaderId: 'amy' }));
    render(
      <GroupForm
        open
        group={orgWithMembers({ leaderId: 'amy' }).groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');

    await user.click(leaderTrigger());
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: '未指定' }));

    await user.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(saveGroupMock).toHaveBeenCalledTimes(1));
    const [savedGroup] = saveGroupMock.mock.calls[0];
    expect(savedGroup.leaderId).toBeNull();
  });

  it('未動組長：既有 leaderId 原樣保留送出（不被表單清掉）', async () => {
    const user = userEvent.setup();
    mockOrg(orgWithMembers({ leaderId: 'amy' }));
    render(
      <GroupForm
        open
        group={orgWithMembers({ leaderId: 'amy' }).groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');

    // 不碰組長下拉，直接儲存。
    await user.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(saveGroupMock).toHaveBeenCalledTimes(1));
    const [savedGroup] = saveGroupMock.mock.calls[0];
    expect(savedGroup.leaderId).toBe('amy');
  });

  it('無成員時：組長下拉停用（aria-disabled），並顯示提示文案', async () => {
    // 空組（無 assignment）→ memberEmployees 為空 → hasMembers=false → 下拉停用。
    mockOrg(
      makeOrgData({
        groups: [group('empty', { code: 'EMPTY', name: '空組' })],
      }),
    );
    render(
      <GroupForm
        open
        group={makeOrgData({
          groups: [group('empty', { code: 'EMPTY', name: '空組' })],
        }).groups[0]}
        isNew={false}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await screen.findByRole('dialog');

    expect(leaderTrigger()).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('此組尚無成員，存檔後再設組長。'),
    ).toBeInTheDocument();
  });
});
