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

/**
 * 佈局結構不變式（新佈局管線：resolveLevels → layoutWithDagre[插 dummy] →
 * centerParents → applyLevelBands）。
 *
 * 這些斷言只看「結構性」性質（節點集合、edge 對應、層帶 Y、同層不重疊、
 * 父對齊子女中心），不鎖死絕對座標，避免日後微調 dagre 參數時脆裂。
 */
describe('buildOrgFlowGraph 佈局結構不變式', () => {
  const NODE_WIDTH = 200; // 與實作一致；同層去重疊保證的最小水平間距下界

  // 父有 2 個直接主匯報部屬：boss(L1) → c1(L2)、boss(L1) → c2(L2)。
  function twoChildrenOrg() {
    return makeOrgData({
      employees: [emp('boss'), emp('c1'), emp('c2')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1', level: 1 }),
        assignment('a-c1', {
          employeeId: 'c1',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          level: 2,
        }),
        assignment('a-c2', {
          employeeId: 'c2',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          level: 2,
        }),
      ],
    });
  }

  // 跨層主匯報：top(L1) → deep(L3)，跨過 L2（中間層無真實節點）。
  function skipLevelOrg() {
    return makeOrgData({
      employees: [emp('top'), emp('deep')],
      groups: [group('g1')],
      assignments: [
        assignment('a-top', { employeeId: 'top', groupId: 'g1', level: 1 }),
        assignment('a-deep', {
          employeeId: 'deep',
          groupId: 'g1',
          supervisorIds: ['top'],
          primarySupervisorId: 'top',
          level: 3,
        }),
      ],
    });
  }

  it('dummy 不外洩：輸出 nodes 只含真實員工、數量等於參與員工數', () => {
    const data = twoChildrenOrg();
    const r = buildOrgFlowGraph(data, 'g1');
    const realIds = new Set(data.assignments.map((a) => a.employeeId));

    // 沒有任何 dummy 中繼節點漏出。
    expect(r.nodes.every((n) => !n.id.includes('__dummy__'))).toBe(true);
    // 每個 node.id 都是真實 employeeId。
    expect(r.nodes.every((n) => realIds.has(n.id))).toBe(true);
    // 節點數 === 參與員工數（無多無少）。
    expect(r.nodes).toHaveLength(realIds.size);
  });

  it('父置中：父 x 落在直接主匯報子女 x 範圍中心（約略中點）', () => {
    const r = buildOrgFlowGraph(twoChildrenOrg(), 'g1');
    const x = (id: string) => r.nodes.find((n) => n.id === id)!.position.x;

    const boss = x('boss');
    const c1 = x('c1');
    const c2 = x('c2');
    const min = Math.min(c1, c2);
    const max = Math.max(c1, c2);

    // 父 x 落在子女 x 範圍內。
    expect(boss).toBeGreaterThanOrEqual(min);
    expect(boss).toBeLessThanOrEqual(max);
    // 約略落在中點（容差半個節點寬，吸收同層去重疊微調）。
    const mid = (min + max) / 2;
    expect(Math.abs(boss - mid)).toBeLessThanOrEqual(NODE_WIDTH / 2);
  });

  it('跨層 dummy 不影響輸出結構：仍只有真實節點、edge 維持原 source→target 單條', () => {
    const r = buildOrgFlowGraph(skipLevelOrg(), 'g1');

    // 跨層雖在 dagre 插了 L2 dummy，輸出 nodes 仍只有真實節點。
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['deep', 'top']);
    expect(r.nodes.every((n) => !n.id.includes('__dummy__'))).toBe(true);

    // edge 未被拆成「經 dummy 的多條」：仍是 1 條 top→deep。
    const topToDeep = r.edges.filter((e) => e.source === 'top' && e.target === 'deep');
    expect(topToDeep).toHaveLength(1);
    expect(r.edges).toHaveLength(1);
    expect(r.edges.every((e) => !e.source.includes('__dummy__') && !e.target.includes('__dummy__'))).toBe(true);
  });

  it('無同層 X 重疊：同一 topY 的節點 x 間距 >= NODE_WIDTH', () => {
    const r = buildOrgFlowGraph(twoChildrenOrg(), 'g1');
    const byTopY = new Map<number, number[]>();
    for (const n of r.nodes) {
      const arr = byTopY.get(n.position.y) ?? [];
      arr.push(n.position.x);
      byTopY.set(n.position.y, arr);
    }
    for (const xs of byTopY.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }
  });

  it('層線含跨層空缺：levels 連續涵蓋 1..3（L2 無節點仍保留輔助線）', () => {
    const r = buildOrgFlowGraph(skipLevelOrg(), 'g1');
    expect(r.levels?.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(r.bounds).toBeDefined();
    expect(r.bounds!.maxX).toBeGreaterThan(r.bounds!.minX);
  });

  it('拖曳吸附：節點 Y === level × LEVEL_GAP，且 levelFromTopY 可反推', () => {
    const r = buildOrgFlowGraph(twoChildrenOrg(), 'g1');
    for (const n of r.nodes) {
      const lv = n.data.level!;
      // topY 對齊層帶。
      expect(n.position.y).toBe(lv * ORG_FLOW_LEVEL_GAP);
      // 反推回原 level（拖曳改層級依賴此一致性）。
      expect(levelFromTopY(n.position.y)).toBe(lv);
      // node.data.levelTopY 與 position.y 一致。
      expect(n.data.levelTopY).toBe(n.position.y);
    }
  });

  it('缺 level 後備：全無顯式 level 時仍輸出真實節點、edge 與 Y 對齊層帶', () => {
    // resolveLevels 缺 level → 純 dagre rank 後備路徑。
    const data = makeOrgData({
      employees: [emp('r'), emp('a'), emp('b')],
      groups: [group('g1')],
      assignments: [
        assignment('a-r', { employeeId: 'r', groupId: 'g1' }),
        assignment('a-a', {
          employeeId: 'a',
          groupId: 'g1',
          supervisorIds: ['r'],
          primarySupervisorId: 'r',
        }),
        assignment('a-b', {
          employeeId: 'b',
          groupId: 'g1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const r = buildOrgFlowGraph(data, 'g1');
    expect(r.error).toBeUndefined();
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'r']);
    expect(r.nodes.every((n) => !n.id.includes('__dummy__'))).toBe(true);
    // 後備 rank 為 1/2/3，Y 對齊層帶。
    for (const n of r.nodes) {
      expect(n.position.y).toBe(n.data.level! * ORG_FLOW_LEVEL_GAP);
    }
    // 後備 rank 對齊樹深：r=1 < a=2 < b=3。
    const lv = (id: string) => r.nodes.find((n) => n.id === id)!.data.level!;
    expect(lv('r')).toBeLessThan(lv('a'));
    expect(lv('a')).toBeLessThan(lv('b'));
  });
});
