import {
  ALL_GROUPS_VIEW_ID,
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

  it('全公司視角納入各 active 組別成員', () => {
    const data = makeOrgData({
      employees: [emp('a'), emp('b')],
      groups: [group('g1'), group('g2')],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-a', { employeeId: 'a', groupId: 'g1', jobLevelId: 'j1' }),
        assignment('a-b', { employeeId: 'b', groupId: 'g2', jobLevelId: 'j1' }),
      ],
    });
    const r = buildGroupMembershipGraph(data, ALL_GROUPS_VIEW_ID);
    const members = r.nodes
      .filter((n) => n.type === 'assignmentMember')
      .map((n) => employeeIdFromMembershipNode(n))
      .sort();
    expect(members).toEqual(['a', 'b']);
  });

  it('組外主管以外部主管節點呈現', () => {
    const data = makeOrgData({
      employees: [emp('staff'), emp('boss')],
      groups: [group('g1'), group('g2')],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // staff 在 g1，主管 boss 卻屬於 g2 → 對 g1 而言 boss 是外部主管
        assignment('a-staff', { employeeId: 'staff', groupId: 'g1', jobLevelId: 'j1', supervisorIds: ['boss'], primarySupervisorId: 'boss' }),
        assignment('a-boss', { employeeId: 'boss', groupId: 'g2', jobLevelId: 'j1' }),
      ],
    });
    const r = buildGroupMembershipGraph(data, 'g1');
    const external = r.nodes
      .filter((n) => n.type === 'externalSupervisor')
      .map((n) => employeeIdFromMembershipNode(n));
    expect(external).toContain('boss');
  });

  it('組內循環匯報回傳錯誤', () => {
    const data = makeOrgData({
      employees: [emp('x'), emp('y')],
      groups: [group('g1')],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-x', { employeeId: 'x', groupId: 'g1', jobLevelId: 'j1', supervisorIds: ['y'] }),
        assignment('a-y', { employeeId: 'y', groupId: 'g1', jobLevelId: 'j1', supervisorIds: ['x'] }),
      ],
    });
    const r = buildGroupMembershipGraph(data, 'g1');
    expect(r.error).toMatch(/循環匯報/);
  });
});

describe('buildGroupMembershipGraph（kindFilter 過濾）', () => {
  function mixedOrg() {
    return makeOrgData({
      employees: [emp('d1'), emp('f1')],
      groups: [
        group('dept', { code: 'DEPT', kind: 'department' }),
        group('fn', { code: 'XFN', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-d', { employeeId: 'd1', groupId: 'dept', jobLevelId: 'j1' }),
        assignment('a-f', { employeeId: 'f1', groupId: 'fn', jobLevelId: 'j1' }),
      ],
    });
  }

  function membersOf(r: { nodes: { type?: string }[] }) {
    return r.nodes
      .filter((n) => n.type === 'assignmentMember')
      .map((n) => employeeIdFromMembershipNode(n as never))
      .sort();
  }

  it('全公司視角不傳 kindFilter＝原行為（部門＋職能都納入）', () => {
    const r = buildGroupMembershipGraph(mixedOrg(), ALL_GROUPS_VIEW_ID);
    expect(membersOf(r)).toEqual(['d1', 'f1']);
  });

  it("全公司視角 kindFilter='function' 只剩職能成員", () => {
    const r = buildGroupMembershipGraph(mixedOrg(), ALL_GROUPS_VIEW_ID, 'function');
    expect(membersOf(r)).toEqual(['f1']);
  });

  it("全公司視角 kindFilter='department' 只剩部門成員", () => {
    const r = buildGroupMembershipGraph(mixedOrg(), ALL_GROUPS_VIEW_ID, 'department');
    expect(membersOf(r)).toEqual(['d1']);
  });

  it('單組視角種類符合過濾＝照常渲染', () => {
    const r = buildGroupMembershipGraph(mixedOrg(), 'fn', 'function');
    expect(membersOf(r)).toEqual(['f1']);
  });

  it('單組視角種類不符過濾＝回空畫面', () => {
    const r = buildGroupMembershipGraph(mixedOrg(), 'dept', 'function');
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.error).toBeUndefined();
  });

  it('單組視角不傳 kindFilter＝原行為（不過濾）', () => {
    const r = buildGroupMembershipGraph(mixedOrg(), 'fn');
    expect(membersOf(r)).toEqual(['f1']);
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
