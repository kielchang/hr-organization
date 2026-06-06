import { buildNodeDiffMap, computeOrgDiff } from './computeOrgDiff';
import { assignment, emp, makeOrgData } from '../test/fixtures';

describe('computeOrgDiff', () => {
  it('偵測新增 / 移除 / 修改的員工', () => {
    const base = makeOrgData({ employees: [emp('e1'), emp('e2')] });
    const current = makeOrgData({
      employees: [emp('e1', { name: '改名' }), emp('e3')],
    });
    const diff = computeOrgDiff(base, current);
    expect([...diff.addedEmployeeIds]).toEqual(['e3']);
    expect([...diff.removedEmployeeIds]).toEqual(['e2']);
    expect([...diff.modifiedEmployeeIds]).toEqual(['e1']);
  });

  it('偵測歸屬變更並標記受影響員工', () => {
    const base = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'e1' })],
    });
    const current = makeOrgData({
      assignments: [
        assignment('a1', { employeeId: 'e1', isPrimaryGroup: false }),
        assignment('a2', { employeeId: 'e2' }),
      ],
    });
    const diff = computeOrgDiff(base, current);
    expect([...diff.addedAssignmentIds]).toEqual(['a2']);
    expect([...diff.modifiedAssignmentIds]).toEqual(['a1']);
    expect(diff.assignmentChangedEmployeeIds.has('e1')).toBe(true);
    expect(diff.assignmentChangedEmployeeIds.has('e2')).toBe(true);
  });

  it('依匯報關係算出新增 / 移除的邊', () => {
    const base = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'e1', supervisorIds: ['boss'] })],
    });
    const current = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'e1', supervisorIds: ['newboss'] })],
    });
    const diff = computeOrgDiff(base, current);
    expect([...diff.addedEdgeKeys]).toContain('newboss->e1');
    expect([...diff.removedEdgeKeys]).toContain('boss->e1');
  });
});

describe('buildNodeDiffMap', () => {
  it('將 diff 對應到節點狀態', () => {
    const base = makeOrgData({ employees: [emp('e1'), emp('e2')] });
    const current = makeOrgData({
      employees: [emp('e1'), emp('e2', { name: '改' }), emp('e3')],
    });
    const diff = computeOrgDiff(base, current);
    const map = buildNodeDiffMap(diff, ['e1', 'e2', 'e3']);
    expect(map.get('e1')).toBe('unchanged');
    expect(map.get('e2')).toBe('modified');
    expect(map.get('e3')).toBe('added');
  });

  it('匯報關係變動會標記主管與部屬皆 modified', () => {
    const base = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'sub', supervisorIds: [] })],
    });
    const current = makeOrgData({
      assignments: [assignment('a1', { employeeId: 'sub', supervisorIds: ['mgr'] })],
    });
    const diff = computeOrgDiff(base, current);
    const map = buildNodeDiffMap(diff, ['sub', 'mgr']);
    expect(map.get('sub')).toBe('modified');
    expect(map.get('mgr')).toBe('modified');
  });
});
