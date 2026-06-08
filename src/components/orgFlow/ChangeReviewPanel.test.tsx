import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangeReviewPanel } from './ChangeReviewPanel';
import { reassignSupervisor } from '../../services/orgOperations';
import {
  assignment,
  emp,
  group,
  jobLevel,
  makeOrgData,
} from '../../test/fixtures';
import type { OrgData } from '../../types/org';

/**
 * ChangeReviewPanel 輕量元件測試（前後對比 + 操作流水兩頁籤）。
 *
 * 不涉入 React Flow 畫布；只驗證面板能渲染 computeFieldDiff／sessionChangeEntries
 * 的結果、頁籤切換、關閉鈕，以及無異動空狀態。
 */

/**
 * 造一組 base/draft：staff 的歸屬主管由 oldBoss 改為 newBoss。
 * 透過真實的 reassignSupervisor 產出 draft，順帶寫入一筆 assignment_update changeLog，
 * 讓「操作流水」頁有 session 新增的操作可顯示。
 */
function makeScenario(): { base: OrgData; draft: OrgData } {
  const base = makeOrgData({
    employees: [
      emp('oldBoss', { name: '舊主管' }),
      emp('newBoss', { name: '新主管' }),
      emp('staff', { name: '員工小明' }),
    ],
    groups: [group('g1', { kind: 'department', name: '研發部' })],
    jobLevels: [jobLevel('j1', 10)],
    assignments: [
      assignment('a-staff', {
        employeeId: 'staff',
        groupId: 'g1',
        jobLevelId: 'j1',
        supervisorIds: ['oldBoss'],
        primarySupervisorId: 'oldBoss',
      }),
    ],
  });

  const { data: draft, error } = reassignSupervisor(
    base,
    'a-staff',
    'newBoss',
    'tester',
  );
  // 前置條件：reassign 必須成功，draft 才反映換主管。
  if (error) throw new Error(`fixture 前置失敗：${error}`);

  return { base, draft };
}

describe('ChangeReviewPanel', () => {
  it('前後對比頁顯示換主管的前值與後值', () => {
    const { base, draft } = makeScenario();
    render(<ChangeReviewPanel base={base} draft={draft} onClose={() => {}} />);

    // 預設在「前後對比」頁。
    const comparePanel = screen.getByRole('tabpanel');
    // 主管欄前值（舊主管）與後值（新主管）皆可見。
    expect(within(comparePanel).getByText('舊主管')).toBeInTheDocument();
    expect(within(comparePanel).getByText('新主管')).toBeInTheDocument();
  });

  it('切到「操作流水」頁可見 session 新增的操作', async () => {
    const user = userEvent.setup();
    const { base, draft } = makeScenario();
    render(<ChangeReviewPanel base={base} draft={draft} onClose={() => {}} />);

    await user.click(screen.getByRole('tab', { name: '操作流水' }));

    // session 新增的 assignment_update 操作：標籤「更新歸屬」可見。
    const logPanel = screen.getByRole('tabpanel');
    expect(within(logPanel).getByText('更新歸屬')).toBeInTheDocument();
  });

  it('點關閉鈕觸發 onClose', async () => {
    const user = userEvent.setup();
    const { base, draft } = makeScenario();
    const onClose = vi.fn();
    render(<ChangeReviewPanel base={base} draft={draft} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '關閉異動歷程' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('無異動（base===draft 結構）顯示空狀態文字', () => {
    const base = makeOrgData({
      employees: [emp('e1', { name: '同' })],
    });
    // 結構相同的 draft（無 session 變更、無新增 changeLog）。
    const draft = makeOrgData({
      employees: [emp('e1', { name: '同' })],
    });
    render(<ChangeReviewPanel base={base} draft={draft} onClose={() => {}} />);

    // 前後對比空狀態。
    expect(screen.getByText('尚無異動。')).toBeInTheDocument();
  });
});
