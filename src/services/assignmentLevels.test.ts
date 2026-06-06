import { backfillAssignmentLevels } from './assignmentLevels';
import { assignment, makeOrgData } from '../test/fixtures';

describe('backfillAssignmentLevels', () => {
  it('已全部有 level 時回傳同一物件（不變動）', () => {
    const data = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'e1', level: 1 })],
    });
    expect(backfillAssignmentLevels(data)).toBe(data);
  });

  it('依組內匯報深度回填 level', () => {
    const data = makeOrgData({
      assignments: [
        assignment('a1', { employeeId: 'boss', groupId: 'g1', supervisorIds: [] }),
        assignment('a2', { employeeId: 'mid', groupId: 'g1', supervisorIds: ['boss'] }),
        assignment('a3', { employeeId: 'low', groupId: 'g1', supervisorIds: ['mid'] }),
      ],
    });
    const out = backfillAssignmentLevels(data);
    expect(out.assignments.find((a) => a.id === 'a1')?.level).toBe(1);
    expect(out.assignments.find((a) => a.id === 'a2')?.level).toBe(2);
    expect(out.assignments.find((a) => a.id === 'a3')?.level).toBe(3);
  });

  it('保留既有 level，只補缺漏者', () => {
    const data = makeOrgData({
      assignments: [
        assignment('a1', { employeeId: 'boss', groupId: 'g1', supervisorIds: [], level: 5 }),
        assignment('a2', { employeeId: 'staff', groupId: 'g1', supervisorIds: ['boss'] }),
      ],
    });
    const out = backfillAssignmentLevels(data);
    expect(out.assignments.find((a) => a.id === 'a1')?.level).toBe(5);
    expect(out.assignments.find((a) => a.id === 'a2')?.level).toBe(2);
  });

  it('跨組各自獨立計算深度', () => {
    const data = makeOrgData({
      assignments: [
        assignment('a1', { employeeId: 'b1', groupId: 'g1', supervisorIds: [] }),
        assignment('a2', { employeeId: 'b2', groupId: 'g2', supervisorIds: [] }),
      ],
    });
    const out = backfillAssignmentLevels(data);
    expect(out.assignments.every((a) => a.level === 1)).toBe(true);
  });
});
