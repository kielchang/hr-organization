import {
  buildGroupMembershipGraph,
  employeeIdFromMembershipNode,
} from './buildGroupMembershipGraph';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

function sampleOrg() {
  return makeOrgData({
    employees: [emp('boss'), emp('staff')],
    groups: [group('g1')],
    jobLevels: [jobLevel('j1', 40)],
    assignments: [
      assignment('a-boss', { employeeId: 'boss', groupId: 'g1', jobLevelId: 'j1' }),
      assignment('a-staff', {
        employeeId: 'staff',
        groupId: 'g1',
        jobLevelId: 'j1',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
      }),
    ],
  });
}

describe('buildGroupMembershipGraph', () => {
  it('未知組別回傳錯誤', () => {
    const r = buildGroupMembershipGraph(makeOrgData(), 'ghost');
    expect(r.error).toBe('找不到組別');
    expect(r.nodes).toEqual([]);
  });

  it('單組視角建立歸屬節點', () => {
    const r = buildGroupMembershipGraph(sampleOrg(), 'g1');
    expect(r.error).toBeUndefined();
    const memberIds = r.nodes
      .filter((n) => n.type === 'assignmentMember')
      .map((n) => employeeIdFromMembershipNode(n))
      .sort();
    expect(memberIds).toEqual(['boss', 'staff']);
  });
});

describe('employeeIdFromMembershipNode', () => {
  it('非成員/主管節點回傳 null', () => {
    expect(
      employeeIdFromMembershipNode({
        id: 'x',
        type: 'groupLabel',
        position: { x: 0, y: 0 },
        data: {},
      }),
    ).toBeNull();
  });
});
