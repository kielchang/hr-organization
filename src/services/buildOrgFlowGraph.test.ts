import {
  ALL_GROUPS_VIEW_ID,
  ORG_FLOW_LEVEL_GAP,
  buildOrgFlowGraph,
  levelFromTopY,
} from './buildOrgFlowGraph';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

function sampleOrg() {
  // boss(g1) ← mid(g1, 主管 boss) ← low(g1, 主管 mid + 虛線 boss)
  return makeOrgData({
    employees: [emp('boss'), emp('mid'), emp('low'), emp('out')],
    groups: [group('g1'), group('g2', { status: 'inactive' })],
    jobLevels: [jobLevel('j1', 40, { name: '經理' }), jobLevel('j2', 10, { name: '專員' })],
    assignments: [
      assignment('a-boss', { employeeId: 'boss', groupId: 'g1', jobLevelId: 'j1', level: 1 }),
      assignment('a-mid', {
        employeeId: 'mid',
        groupId: 'g1',
        jobLevelId: 'j2',
        supervisorIds: ['boss'],
        primarySupervisorId: 'boss',
        level: 2,
      }),
      assignment('a-low', {
        employeeId: 'low',
        groupId: 'g1',
        jobLevelId: 'j2',
        supervisorIds: ['mid', 'boss'],
        primarySupervisorId: 'mid',
        level: 3,
      }),
      // 停用組別 g2 的成員，ALL_GROUPS 視角應排除
      assignment('a-out', { employeeId: 'out', groupId: 'g2', jobLevelId: 'j2' }),
    ],
  });
}

describe('levelFromTopY', () => {
  it('由 topY 反推層級值', () => {
    expect(levelFromTopY(0)).toBe(0);
    expect(levelFromTopY(ORG_FLOW_LEVEL_GAP)).toBe(1);
    expect(levelFromTopY(ORG_FLOW_LEVEL_GAP * 3)).toBe(3);
  });
});

describe('buildOrgFlowGraph', () => {
  it('未知組別回傳錯誤', () => {
    const r = buildOrgFlowGraph(makeOrgData(), 'ghost');
    expect(r.error).toBe('找不到組別');
    expect(r.nodes).toEqual([]);
  });

  it('偵測到匯報循環回傳錯誤', () => {
    const data = makeOrgData({
      employees: [emp('x'), emp('y')],
      groups: [group('g1')],
      assignments: [
        assignment('a1', { employeeId: 'x', groupId: 'g1', supervisorIds: ['y'] }),
        assignment('a2', { employeeId: 'y', groupId: 'g1', supervisorIds: ['x'] }),
      ],
    });
    const r = buildOrgFlowGraph(data, 'g1');
    expect(r.error).toMatch(/循環匯報/);
  });

  it('單組視角：建立成員節點與匯報邊（主匯報 vs 虛線）', () => {
    const r = buildOrgFlowGraph(sampleOrg(), 'g1');
    expect(r.error).toBeUndefined();
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['boss', 'low', 'mid']);

    const primary = r.edges.find((e) => e.source === 'boss' && e.target === 'mid');
    const dotted = r.edges.find((e) => e.source === 'boss' && e.target === 'low');
    expect(primary?.label).toBe('主匯報');
    expect(dotted?.label).toBe('虛線匯報');
  });

  it('節點 data 帶職級名稱、主組別與層級', () => {
    const r = buildOrgFlowGraph(sampleOrg(), 'g1');
    const boss = r.nodes.find((n) => n.id === 'boss');
    expect(boss?.data.jobLevelName).toBe('經理');
    expect(boss?.data.isPrimaryGroup).toBe(true);
    expect(boss?.data.groupName).toBe('g1');
    expect(boss?.data.level).toBe(1);
  });

  it('層級線涵蓋 min..max 層、bounds 存在', () => {
    const r = buildOrgFlowGraph(sampleOrg(), 'g1');
    expect(r.levels?.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(r.bounds).toBeDefined();
    expect(r.bounds!.maxX).toBeGreaterThan(r.bounds!.minX);
  });

  it('全公司視角排除停用組別成員', () => {
    const r = buildOrgFlowGraph(sampleOrg(), ALL_GROUPS_VIEW_ID);
    expect(r.nodes.map((n) => n.id)).not.toContain('out');
    expect(r.nodes).toHaveLength(3);
  });

  it('diffMap 帶入節點 data.diffStatus', () => {
    const diffMap = new Map([['boss', 'modified' as const]]);
    const r = buildOrgFlowGraph(sampleOrg(), 'g1', diffMap);
    expect(r.nodes.find((n) => n.id === 'boss')?.data.diffStatus).toBe('modified');
  });
});
