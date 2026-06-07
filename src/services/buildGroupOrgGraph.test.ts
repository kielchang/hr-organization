import { describe, expect, it } from 'vitest';
import {
  ALL_GROUPS_VIEW_ID,
  buildGroupOrgGraph,
  type GroupBoxNodeData,
} from './buildGroupOrgGraph';
import {
  ORG_FLOW_LEVEL_GAP,
  ORG_FLOW_NODE_HEIGHT,
  ORG_FLOW_NODE_WIDTH,
} from './buildOrgFlowGraph';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';
import type { Node } from '@xyflow/react';

/**
 * buildGroupOrgGraph（D1）：組別為主佈局。每個顯示的 active 組 → 一個 `groupBox`
 * 父節點 + 成員（含推導 co-leader）`employee` 子節點（parentId/extent='parent'）。
 *
 * 斷言聚焦「結構性不變式」而非絕對座標：
 * - 組別框集合（per active 顯示組、停用排除、ALL vs 單組）。
 * - 成員 parentId/extent、節點數含 co-leader 納入。
 * - 成員節點 id 作用域化 `${groupId}::${employeeId}`（裸 employeeId 仍在
 *   node.data.employee.id）；ALL 視角同員工跨多組 → 節點 id 全圖唯一、無重撞。
 * - co-lead 與 leader 同層（同 Y）；co-leader 部屬落在 co-leader 下一層。
 * - 組內匯報邊併入頂層 edges（type='reporting'、端點為作用域化 id、data.isPrimary）。
 * - 組間 parentId 邊（department 父子框；function 無；type='default'）。
 * - 所有 edge id 全域唯一。
 * - 父先排序（groupBox 在其子節點之前；RF v12 要求）。
 * - 框尺寸/相對座標合理；防呆（未知組/空組/循環）。
 */

const BOX_TYPE = 'groupBox';

/** 取得某組的 groupBox 節點（type='groupBox'、id=`group:${groupId}`）。 */
function boxOf(nodes: Node[], groupId: string): Node<GroupBoxNodeData> | undefined {
  return nodes.find(
    (n) => n.type === BOX_TYPE && n.id === `group:${groupId}`,
  ) as Node<GroupBoxNodeData> | undefined;
}

/** 取得某組所有成員子節點（type='employee' 且 parentId 指向該框）。 */
function membersOf(nodes: Node[], groupId: string): Node[] {
  return nodes.filter(
    (n) => n.type === 'employee' && n.parentId === `group:${groupId}`,
  );
}

/** 取得作用域化成員節點 id（`${groupId}::${employeeId}`，與實作一致）。 */
function scopedId(groupId: string, employeeId: string): string {
  return `${groupId}::${employeeId}`;
}

/**
 * 取得單一員工子節點。成員節點 id 已作用域化（`${groupId}::${employeeId}`），
 * 裸 employeeId 仍保留在 `node.data.employee.id` → 以此還原查找。
 * 同員工跨多組時可指定 groupId 精確定位某框內節點。
 */
function memberNode(
  nodes: Node[],
  employeeId: string,
  groupId?: string,
): Node | undefined {
  return nodes.find(
    (n) =>
      n.type === 'employee' &&
      (n.data as { employee: { id: string } }).employee.id === employeeId &&
      (groupId == null || n.parentId === `group:${groupId}`),
  );
}

describe('buildGroupOrgGraph 防呆', () => {
  it('未知組別 → error「找不到組別」、空 nodes/edges', () => {
    const r = buildGroupOrgGraph(makeOrgData(), 'ghost');
    expect(r.error).toBe('找不到組別');
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.leadership.size).toBe(0);
  });

  it('組存在但停用（單組視角）→ 空畫面、非錯誤', () => {
    const data = makeOrgData({
      employees: [emp('e1')],
      groups: [group('g1', { status: 'inactive' })],
      assignments: [assignment('a1', { employeeId: 'e1', groupId: 'g1' })],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.error).toBeUndefined();
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
  });

  it('空組（無成員）→ 仍有一個空框、無成員子節點', () => {
    const data = makeOrgData({
      groups: [group('g1')],
      assignments: [],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.error).toBeUndefined();
    expect(boxOf(r.nodes, 'g1')).toBeDefined();
    expect(membersOf(r.nodes, 'g1')).toHaveLength(0);
  });

  it('ALL 視角且無 active 組 → 空畫面', () => {
    const data = makeOrgData({
      groups: [group('g1', { status: 'inactive' })],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    expect(r.error).toBeUndefined();
    expect(r.nodes).toEqual([]);
  });

  it('匯報循環（組內互為主管）→ error 含「循環匯報」、空 nodes', () => {
    const data = makeOrgData({
      employees: [emp('x'), emp('y')],
      groups: [group('g1')],
      assignments: [
        assignment('a1', {
          employeeId: 'x',
          groupId: 'g1',
          supervisorIds: ['y'],
          primarySupervisorId: 'y',
        }),
        assignment('a2', {
          employeeId: 'y',
          groupId: 'g1',
          supervisorIds: ['x'],
          primarySupervisorId: 'x',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.error).toMatch(/循環匯報/);
    expect(r.nodes).toEqual([]);
  });
});

describe('buildGroupOrgGraph 組別框集合', () => {
  /** boss(g1) ← mid(g1) ← low(g1)；g2 停用、g3 active 空組。 */
  function org() {
    return makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low'), emp('out')],
      groups: [
        group('g1'),
        group('g2', { status: 'inactive' }),
        group('g3'),
      ],
      jobLevels: [jobLevel('j1', 40, { name: '經理' })],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1', jobLevelId: 'j1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          jobLevelId: 'j1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-low', {
          employeeId: 'low',
          groupId: 'g1',
          jobLevelId: 'j1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
        assignment('a-out', { employeeId: 'out', groupId: 'g2' }),
      ],
    });
  }

  it('ALL 視角：每個 active 組一個框（停用組不顯示）', () => {
    const r = buildGroupOrgGraph(org(), ALL_GROUPS_VIEW_ID);
    const boxIds = r.nodes
      .filter((n) => n.type === BOX_TYPE)
      .map((n) => n.id)
      .sort();
    // g1/g3 active → 兩框；g2 停用 → 不顯示。
    expect(boxIds).toEqual(['group:g1', 'group:g3']);
  });

  it('單組視角：只有該組一個框', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const boxes = r.nodes.filter((n) => n.type === BOX_TYPE);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].id).toBe('group:g1');
  });

  it('停用組的成員不出現在 ALL 視角', () => {
    const r = buildGroupOrgGraph(org(), ALL_GROUPS_VIEW_ID);
    expect(memberNode(r.nodes, 'out')).toBeUndefined();
  });

  it('groupBox 節點帶 data（groupId/groupName/kind/leaderId/coLeaderIds/尺寸）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(box.data.groupId).toBe('g1');
    expect(box.data.groupName).toBe('g1');
    expect(box.data.kind).toBe('department');
    // 無顯式 leaderId → 回退組內匯報根 boss。
    expect(box.data.leaderId).toBe('boss');
    expect(box.data.coLeaderIds).toEqual([]);
    expect(box.data.width).toBeGreaterThan(0);
    expect(box.data.height).toBeGreaterThan(0);
  });
});

describe('buildGroupOrgGraph 成員子節點', () => {
  function org() {
    return makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-low', {
          employeeId: 'low',
          groupId: 'g1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
  }

  it('成員 parentId===group:${g.id}、extent===parent', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const members = membersOf(r.nodes, 'g1');
    expect(members).toHaveLength(3);
    for (const m of members) {
      expect(m.parentId).toBe('group:g1');
      expect(m.extent).toBe('parent');
    }
  });

  it('成員節點數 === 組成員數（節點 id 作用域化 `${groupId}::${employeeId}`）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const memberIds = membersOf(r.nodes, 'g1')
      .map((n) => n.id)
      .sort();
    // 節點 id 作用域化；裸 employeeId 仍保留在 node.data.employee.id。
    expect(memberIds).toEqual([
      scopedId('g1', 'boss'),
      scopedId('g1', 'low'),
      scopedId('g1', 'mid'),
    ]);
    const empIds = membersOf(r.nodes, 'g1')
      .map((n) => (n.data as { employee: { id: string } }).employee.id)
      .sort();
    expect(empIds).toEqual(['boss', 'low', 'mid']);
  });

  it('成員節點 type==="employee"、帶職級名稱/groupName/level', () => {
    const data = makeOrgData({
      employees: [emp('boss')],
      groups: [group('g1', { name: '業務部' })],
      jobLevels: [jobLevel('j1', 40, { name: '經理' })],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1', jobLevelId: 'j1' }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    const boss = memberNode(r.nodes, 'boss')!;
    expect(boss.type).toBe('employee');
    expect((boss.data as { jobLevelName: string }).jobLevelName).toBe('經理');
    expect((boss.data as { groupName: string }).groupName).toBe('業務部');
    expect(typeof (boss.data as { level?: number }).level).toBe('number');
  });

  it('成員節點帶該員 assignmentId（非空）；diffMap 帶入 diffStatus', () => {
    const diffMap = new Map([['boss', 'modified' as const]]);
    const r = buildGroupOrgGraph(org(), 'g1', diffMap);
    const boss = memberNode(r.nodes, 'boss')!;
    expect((boss.data as { assignmentId: string }).assignmentId).toBe('a-boss');
    expect((boss.data as { diffStatus?: string }).diffStatus).toBe('modified');
  });
});

describe('buildGroupOrgGraph ALL 視角節點 id 唯一（作用域化）', () => {
  /**
   * 同一員工跨多組（含 co-leader 被納入多框）→ 全圖成員節點 id 必須唯一。
   *
   * 佈局：
   * - dual 同時隸屬 g1 與 g2（兩組各一筆 assignment）→ 跨組同員工。
   * - boss 任職 hq、為 hq 組長（isLeadLevel 夠格），且是 g1、g2 兩組成員的**組外
   *   primary 主管**；g1/g2 的 leaderId 各為本組成員（a0/b0，非 boss）→ boss 對
   *   g1、g2 皆符合 co-leader 條件（sup ∉ M、sup ≠ leaderId、isLeadLevel）→ boss
   *   同時被納入 g1、g2 兩框（同員工出現在多框）。
   *
   * 期望：用裸 employeeId 會在多框產生相同 id；實作以 `${groupId}::${employeeId}`
   * 作用域化 → 全圖成員節點 id 集合大小 == 成員節點數（無重撞）。
   */
  function crossGroupOrg() {
    return makeOrgData({
      employees: [
        emp('boss'),
        emp('dual'),
        emp('a0'),
        emp('a1'),
        emp('b0'),
        emp('b1'),
      ],
      groups: [
        group('hq', { leaderId: 'boss' }),
        group('g1', { leaderId: 'a0' }),
        group('g2', { leaderId: 'b0' }),
      ],
      assignments: [
        // boss 任職 hq、為 hq 組長 → isLeadLevel 夠格當組外共管。
        assignment('h-boss', { employeeId: 'boss', groupId: 'hq' }),
        // dual 同時隸屬 g1 與 g2（跨組同員工）。
        assignment('d-g1', { employeeId: 'dual', groupId: 'g1' }),
        assignment('d-g2', {
          employeeId: 'dual',
          groupId: 'g2',
          isPrimaryGroup: false,
        }),
        // g1：本組組長 a0；a1 的組外 primary 主管為 boss → boss 為 g1 co-leader。
        assignment('a0-g1', { employeeId: 'a0', groupId: 'g1' }),
        assignment('a1-g1', {
          employeeId: 'a1',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        // g2：本組組長 b0；b1 的組外 primary 主管為 boss → boss 為 g2 co-leader。
        assignment('b0-g2', { employeeId: 'b0', groupId: 'g2' }),
        assignment('b1-g2', {
          employeeId: 'b1',
          groupId: 'g2',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
  }

  it('全圖成員節點 id 為作用域化格式 `${groupId}::${employeeId}`', () => {
    const r = buildGroupOrgGraph(crossGroupOrg(), ALL_GROUPS_VIEW_ID);
    const memberNodes = r.nodes.filter((n) => n.type === 'employee');
    for (const n of memberNodes) {
      const empId = (n.data as { employee: { id: string } }).employee.id;
      const gid = (n.parentId as string).replace(/^group:/, '');
      expect(n.id).toBe(scopedId(gid, empId));
    }
  });

  it('同員工跨多組（含 co-leader 納入多框）→ 節點 id 集合大小 == 成員節點數（無重撞）', () => {
    const r = buildGroupOrgGraph(crossGroupOrg(), ALL_GROUPS_VIEW_ID);
    const memberNodes = r.nodes.filter((n) => n.type === 'employee');
    const ids = memberNodes.map((n) => n.id);
    // 全圖唯一：若用裸 employeeId，dual（跨 g1/g2）與 lead（co-lead 入 g1/g2）
    // 會在多框重撞；作用域化後集合大小 == 節點數。
    expect(new Set(ids).size).toBe(memberNodes.length);

    // 實證確有「同一裸 employeeId 出現在多框」（否則此測試無鑑別力）。
    const dualNodes = memberNodes.filter(
      (n) => (n.data as { employee: { id: string } }).employee.id === 'dual',
    );
    const bossNodes = memberNodes.filter(
      (n) => (n.data as { employee: { id: string } }).employee.id === 'boss',
    );
    // dual 跨 g1/g2；boss 以 co-leader 身分被納入 g1、g2 兩框 → 各自 ≥2 節點。
    expect(dualNodes.length).toBeGreaterThanOrEqual(2);
    expect(bossNodes.length).toBeGreaterThanOrEqual(2);
    // 跨框同員工的節點 id 仍互異（作用域不同）。
    expect(new Set(dualNodes.map((n) => n.id)).size).toBe(dualNodes.length);
    expect(new Set(bossNodes.map((n) => n.id)).size).toBe(bossNodes.length);
  });

  it('裸 employeeId 仍保留在 node.data.employee.id（供 D2 選取/diff 還原）', () => {
    const r = buildGroupOrgGraph(crossGroupOrg(), ALL_GROUPS_VIEW_ID);
    const dualG1 = memberNode(r.nodes, 'dual', 'g1')!;
    const dualG2 = memberNode(r.nodes, 'dual', 'g2')!;
    // 不同框 → 節點 id 不同，但 data.employee.id 同為裸 employeeId。
    expect(dualG1.id).not.toBe(dualG2.id);
    expect((dualG1.data as { employee: { id: string } }).employee.id).toBe('dual');
    expect((dualG2.data as { employee: { id: string } }).employee.id).toBe('dual');
  });
});

describe('buildGroupOrgGraph co-leader 納框與同層', () => {
  /**
   * CEO/COO 案：sales 組 leaderId=CEO（CEO 本人不在 sales）。
   * 成員 s1/s2 主管 CEO；s3/s4 主管 COO（COO 組外、是 exec 組 leaderId → 夠格）。
   * → COO 為 co-leader、納入 sales 框、與 leader（CEO？）同層。
   *
   * 注意：leaderId=CEO，但 CEO 不在 sales 成員集合，故框內的「leader 同層基準」
   * 由實作以 depthMap 推得（leaderLevel）。co-leader（COO）與其鉗到同層。
   */
  function ceoCooOrg() {
    const sales = group('sales', { leaderId: 'CEO' });
    return makeOrgData({
      employees: [
        emp('CEO'),
        emp('COO'),
        emp('s1'),
        emp('s2'),
        emp('s3'),
        emp('s4'),
      ],
      groups: [sales, group('exec', { leaderId: 'COO' })],
      assignments: [
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-coo', {
          employeeId: 'COO',
          groupId: 'exec',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s1', {
          employeeId: 's1',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s2', {
          employeeId: 's2',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s3', {
          employeeId: 's3',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
        assignment('x-s4', {
          employeeId: 's4',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
      ],
    });
  }

  it('co-leader（組外主管）納入組框作為成員節點', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    // s1..s4 為成員、COO 為 co-leader 納入。CEO 是 leaderId 但不在 sales 成員、
    // 也非「組外 primary 主管帶成員」之 co-leader（CEO==leaderId 被排除）→ 不納框。
    const empIds = membersOf(r.nodes, 'sales')
      .map((n) => (n.data as { employee: { id: string } }).employee.id)
      .sort();
    expect(empIds).toEqual(['COO', 's1', 's2', 's3', 's4']);
    // 節點 id 作用域化到 sales 框。
    const ids = membersOf(r.nodes, 'sales')
      .map((n) => n.id)
      .sort();
    expect(ids).toEqual([
      scopedId('sales', 'COO'),
      scopedId('sales', 's1'),
      scopedId('sales', 's2'),
      scopedId('sales', 's3'),
      scopedId('sales', 's4'),
    ]);
  });

  it('co-leader assignmentId 為空字串（組外、無本組 assignment）', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const coo = memberNode(r.nodes, 'COO')!;
    expect((coo.data as { assignmentId: string }).assignmentId).toBe('');
    // 一般成員有非空 assignmentId（對照）。
    const s3 = memberNode(r.nodes, 's3')!;
    expect((s3.data as { assignmentId: string }).assignmentId).toBe('x-s3');
  });

  it('co-leader 部屬（s3/s4）落在 co-leader（COO）下一層（非與組長同層）', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const lv = (id: string) =>
      (memberNode(r.nodes, id)!.data as { level: number }).level;
    // s1/s2 主管 CEO（leaderId、組外非 co-leader）→ 落 leaderLevel 起算的根層。
    // COO 為 co-leader → 與 leader 同層；s3/s4 主管 COO → COO 下一層。
    expect(lv('s3')).toBe(lv('COO') + 1);
    expect(lv('s4')).toBe(lv('COO') + 1);
    // 確認 s3/s4 確實比 COO 低一層（非同層）。
    expect(lv('s3')).toBeGreaterThan(lv('COO'));
  });

  it('co-lead 與「組長同層」：COO（co-leader）與 s1/s2（直屬組長 CEO 的成員）同層', () => {
    // CEO 是 leaderId 但不在框內；CEO 的直屬 s1/s2 為框內最上層（leaderLevel 起算根）。
    // COO 為 co-leader → 鉗到 leaderLevel → 與 s1/s2 同層（呈現平行同層共管）。
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const lv = (id: string) =>
      (memberNode(r.nodes, id)!.data as { level: number }).level;
    expect(lv('COO')).toBe(lv('s1'));
    expect(lv('COO')).toBe(lv('s2'));
  });

  it('co-lead 與 leader 同層（leader 在組內案）：leader 與 co-leader 同 Y', () => {
    // 業務部 leaderId=lead（在組內、無上級）；成員 m 主管 lead；
    // 另一成員 m2 主管 coLead（組外、是 exec leaderId → 夠格 co-leader）。
    const sales = group('sales', { leaderId: 'lead' });
    const data = makeOrgData({
      employees: [emp('lead'), emp('coLead'), emp('m'), emp('m2')],
      groups: [sales, group('exec', { leaderId: 'coLead' })],
      assignments: [
        assignment('x-lead', { employeeId: 'lead', groupId: 'sales' }),
        assignment('x-co', { employeeId: 'coLead', groupId: 'exec' }),
        assignment('x-m', {
          employeeId: 'm',
          groupId: 'sales',
          supervisorIds: ['lead'],
          primarySupervisorId: 'lead',
        }),
        assignment('x-m2', {
          employeeId: 'm2',
          groupId: 'sales',
          supervisorIds: ['coLead'],
          primarySupervisorId: 'coLead',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'sales');
    const node = (id: string) => memberNode(r.nodes, id)!;
    const lvl = (id: string) => (node(id).data as { level: number }).level;
    // leader 與 co-leader 同層級。
    expect(lvl('coLead')).toBe(lvl('lead'));
    // 同層級 → 同 Y（applyLevelBands 以 level 決定 Y）。
    expect(node('coLead').position.y).toBe(node('lead').position.y);
    // co-leader 的部屬 m2 落在下一層（比 co-leader 大 1）。
    expect(lvl('m2')).toBe(lvl('coLead') + 1);
  });

  it('成員節點數 = 成員數 + 納入的 co-leader 數', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    // sales 成員 = {s1,s2,s3,s4}=4；納入 co-leader COO=1 → 共 5。
    expect(membersOf(r.nodes, 'sales')).toHaveLength(5);
  });
});

describe('buildGroupOrgGraph 組間關聯邊', () => {
  it('department 父子框 → group:parent→group:child 邊', () => {
    const data = makeOrgData({
      employees: [emp('p'), emp('c')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-c', { employeeId: 'c', groupId: 'child' }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const link = r.edges.find(
      (e) => e.source === 'group:parent' && e.target === 'group:child',
    );
    expect(link).toBeDefined();
    // 組間 link 邊為 type='default'（與組內 reporting 邊區隔）。
    expect(link!.type).toBe('default');
  });

  it('function 組（parentId null）→ 無組間邊', () => {
    const data = makeOrgData({
      employees: [emp('a'), emp('b')],
      groups: [
        group('fn1', { kind: 'function', parentId: null }),
        group('fn2', { kind: 'function', parentId: null }),
      ],
      assignments: [
        assignment('a-a', { employeeId: 'a', groupId: 'fn1' }),
        assignment('a-b', { employeeId: 'b', groupId: 'fn2' }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    // 框間無 group:→group: 邊（兩個職能組各自並排）。
    const linkEdges = r.edges.filter(
      (e) => e.source.startsWith('group:') && e.target.startsWith('group:'),
    );
    expect(linkEdges).toHaveLength(0);
  });

  it('單組視角：父框不在顯示集合 → 不連組間邊', () => {
    const data = makeOrgData({
      employees: [emp('p'), emp('c')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-c', { employeeId: 'c', groupId: 'child' }),
      ],
    });
    // 僅顯示 child → parent 不在集合 → 無組間邊。
    const r = buildGroupOrgGraph(data, 'child');
    const linkEdges = r.edges.filter(
      (e) => e.source.startsWith('group:') && e.target.startsWith('group:'),
    );
    expect(linkEdges).toHaveLength(0);
  });

  /**
   * 組內成員匯報邊併入頂層 edges（先前缺口已修）：
   *
   * `layoutIntraGroup` 算出的組內成員匯報邊（type='reporting'、`data.isPrimary`）
   * 現已併入 `buildGroupOrgGraph` 回傳的頂層 `edges`，端點為作用域化 id
   * （`${groupId}::${employeeId}`，與成員節點 id 一致）。
   *
   * 這讓 GroupOrgFlowChart `edges={edges}` 能在框內畫出成員間匯報連線，
   * 與 GroupOrgLegendInfo 圖例（主匯報實線／其他主管虛線）一致。
   */
  it('組內成員匯報邊併入頂層 edges：含 type=reporting、端點為作用域化 id、data.isPrimary', () => {
    const data = makeOrgData({
      employees: [emp('boss'), emp('mid')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    // 組內匯報邊存在：端點為作用域化 id（指向同框 boss/mid 成員節點）。
    const intra = r.edges.find(
      (e) =>
        e.source === scopedId('g1', 'boss') &&
        e.target === scopedId('g1', 'mid'),
    );
    expect(intra).toBeDefined();
    expect(intra!.type).toBe('reporting');
    // boss 為 mid 的 primarySupervisor → 主匯報（實線）。
    expect((intra!.data as { isPrimary: boolean }).isPrimary).toBe(true);
    // 端點 id 與實際成員節點 id 對得上（非懸空邊）。
    const ids = new Set(
      membersOf(r.nodes, 'g1').map((n) => n.id),
    );
    expect(ids.has(intra!.source)).toBe(true);
    expect(ids.has(intra!.target)).toBe(true);
    // 單組視角無組間 link 邊（無父框在集合內）→ edges 僅該組內邊。
    expect(r.edges).toHaveLength(1);
  });

  it('組內次匯報邊（非 primary supervisor）→ data.isPrimary=false（虛線）', () => {
    // mid 的 primary 主管 = boss；另有次要主管 boss2（同組顯示）→ 次匯報虛線。
    const data = makeOrgData({
      employees: [emp('boss'), emp('boss2'), emp('mid')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-boss2', { employeeId: 'boss2', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss', 'boss2'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    const primary = r.edges.find(
      (e) =>
        e.source === scopedId('g1', 'boss') &&
        e.target === scopedId('g1', 'mid'),
    );
    const secondary = r.edges.find(
      (e) =>
        e.source === scopedId('g1', 'boss2') &&
        e.target === scopedId('g1', 'mid'),
    );
    expect((primary!.data as { isPrimary: boolean }).isPrimary).toBe(true);
    expect((secondary!.data as { isPrimary: boolean }).isPrimary).toBe(false);
  });

  it('所有 edge id 全域唯一（組內 reporting + 組間 link 不重撞）', () => {
    // 含組內匯報邊（多組）與組間 link 邊：父子 department + 各組內鏈。
    const data = makeOrgData({
      employees: [emp('p'), emp('pc'), emp('c'), emp('cc')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-pc', {
          employeeId: 'pc',
          groupId: 'parent',
          supervisorIds: ['p'],
          primarySupervisorId: 'p',
        }),
        assignment('a-c', { employeeId: 'c', groupId: 'child' }),
        assignment('a-cc', {
          employeeId: 'cc',
          groupId: 'child',
          supervisorIds: ['c'],
          primarySupervisorId: 'c',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const edgeIds = r.edges.map((e) => e.id);
    // 同時涵蓋 reporting（組內）與 default（組間 link）兩類邊。
    expect(r.edges.some((e) => e.type === 'reporting')).toBe(true);
    expect(r.edges.some((e) => e.type === 'default')).toBe(true);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });
});

describe('buildGroupOrgGraph 父先排序（RF v12）', () => {
  it('每個 groupBox 出現在其所有子節點之前', () => {
    const data = makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('a'), emp('b')],
      groups: [group('g1'), group('g2')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-a', { employeeId: 'a', groupId: 'g2' }),
        assignment('a-b', {
          employeeId: 'b',
          groupId: 'g2',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const order = r.nodes.map((n) => n.id);
    // 對每個成員子節點，其 parent 框的 index 必須在前。
    for (const n of r.nodes) {
      if (n.type === 'employee' && n.parentId) {
        const parentIdx = order.indexOf(n.parentId);
        const childIdx = order.indexOf(n.id);
        expect(parentIdx).toBeGreaterThanOrEqual(0);
        expect(parentIdx).toBeLessThan(childIdx);
      }
    }
  });
});

describe('buildGroupOrgGraph 框尺寸與相對座標', () => {
  function org() {
    return makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-low', {
          employeeId: 'low',
          groupId: 'g1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
  }

  it('框寬高足以容納其成員（成員相對座標 + 節點尺寸 ≤ 框尺寸）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const { width, height } = box.data;
    for (const m of membersOf(r.nodes, 'g1')) {
      // extent='parent'：座標相對框左上。應落在框內、含節點寬高仍不溢出。
      expect(m.position.x).toBeGreaterThanOrEqual(0);
      expect(m.position.y).toBeGreaterThanOrEqual(0);
      expect(m.position.x + ORG_FLOW_NODE_WIDTH).toBeLessThanOrEqual(width);
      expect(m.position.y + ORG_FLOW_NODE_HEIGHT).toBeLessThanOrEqual(height);
    }
  });

  it('框 style.width/height 與 data.width/height 一致', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(box.style?.width).toBe(box.data.width);
    expect(box.style?.height).toBe(box.data.height);
  });

  it('空組框仍有合理最小尺寸（>0）', () => {
    const data = makeOrgData({ groups: [group('g1')] });
    const r = buildGroupOrgGraph(data, 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(box.data.width).toBeGreaterThan(0);
    expect(box.data.height).toBeGreaterThan(0);
  });

  it('leadership Map 涵蓋顯示組、帶 leaderId/coLeaderIds', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    expect([...r.leadership.keys()]).toEqual(['g1']);
    const lead = r.leadership.get('g1')!;
    expect(lead.leaderId).toBe('boss');
    expect(lead.coLeaderIds).toEqual([]);
  });
});

/**
 * 組內層級輔助線（data.levelLines）：補強 #1。
 *
 * `layoutIntraGroup` 把 `layoutReportingSubgraph` 回傳的層帶（`levels`，y = 該層
 * 節點中心 Y）轉成「框內相對座標」帶進 groupBox 的 `data.levelLines`：
 *   y = lv.y − minY + BOX_TITLE_HEIGHT + BOX_PADDING（與成員子節點同一套位移）。
 *
 * 斷言聚焦結構性不變式（非絕對像素）：
 * - 每條 levelLine 的 y 落在框內合理範圍（≥ 標題列+內距、≤ 框高）。
 * - label 為「第N層」字樣、含 level 數字；level 沿組內相對層級遞增。
 * - 多層匯報 → 多條 levelLine（層數 == 框內出現的相異層級數）。
 * - levelLine.y 與同層成員「節點中心」對齊（memberY + NODE_HEIGHT/2 ≈ 某條 line.y）。
 * - 組間 link 邊 `go-link-*` 帶 style（stroke + strokeWidth）。
 *
 * 常數與實作同源（避免硬編魔數漂移）。
 */
describe('buildGroupOrgGraph 組內層級輔助線 data.levelLines', () => {
  // 與實作一致的框內位移常數（buildGroupOrgGraph 私有，不導出 → 此處鏡像）。
  const BOX_TITLE_HEIGHT = 56;
  const BOX_PADDING = 24;
  /** 框內相對位移基準：成員/輔助線皆 +（標題列 + 內距）。 */
  const INNER_OFFSET = BOX_TITLE_HEIGHT + BOX_PADDING;

  /** boss ← mid ← low：三層單鏈（產生三條層線）。 */
  function threeLevelOrg() {
    return makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid', {
          employeeId: 'mid',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-low', {
          employeeId: 'low',
          groupId: 'g1',
          supervisorIds: ['mid'],
          primarySupervisorId: 'mid',
        }),
      ],
    });
  }

  it('groupBox.data.levelLines 存在且為陣列、每條帶 level/y/label', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(Array.isArray(box.data.levelLines)).toBe(true);
    expect(box.data.levelLines.length).toBeGreaterThan(0);
    for (const line of box.data.levelLines) {
      expect(typeof line.level).toBe('number');
      expect(typeof line.y).toBe('number');
      expect(typeof line.label).toBe('string');
    }
  });

  it('每條 level line 的 y 落在框內合理範圍（≥ 標題列+內距、≤ 框高）', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const { height } = box.data;
    for (const line of box.data.levelLines) {
      // 層線中心至少落在「標題列 + 內距」之下（不會壓在標題列上）。
      expect(line.y).toBeGreaterThanOrEqual(INNER_OFFSET);
      // 不溢出框高。
      expect(line.y).toBeLessThanOrEqual(height);
    }
  });

  it('label 為「第N層」字樣、含對應 level 數字；level 嚴格遞增', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const lines = box.data.levelLines;
    for (const line of lines) {
      // 「第 N 層」（容許數字前後有空白；只認結構不認固定間距）。
      expect(line.label).toMatch(/^第\s*\d+\s*層$/);
      // label 的數字 == 該條 level（標籤用實際 level 值、不重新編號）。
      const num = Number(line.label.replace(/[^\d]/g, ''));
      expect(num).toBe(line.level);
    }
    // level 沿組內相對層級遞增（applyLevelBands 由 minLevel→maxLevel 連續填）。
    const levels = lines.map((l) => l.level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });

  it('多層匯報的組 → 多條 level line（三層鏈 → 三條相異層線）', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const lines = box.data.levelLines;
    // boss/mid/low 三層 → 三個相異層級 → 三條層線。
    expect(lines.length).toBe(3);
    expect(new Set(lines.map((l) => l.level)).size).toBe(3);
  });

  it('單人組 → 僅一條 level line', () => {
    const data = makeOrgData({
      employees: [emp('solo')],
      groups: [group('g1')],
      assignments: [assignment('a-solo', { employeeId: 'solo', groupId: 'g1' })],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(box.data.levelLines.length).toBe(1);
  });

  it('空組（無成員）→ 無 level line（layoutReportingSubgraph 空輸入）', () => {
    const data = makeOrgData({ groups: [group('g1')] });
    const r = buildGroupOrgGraph(data, 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    expect(box.data.levelLines).toEqual([]);
  });

  it('level line 的 y 與同層成員「節點中心」對齊（memberY + NODE_HEIGHT/2 ≈ 某條 line.y）', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const lines = box.data.levelLines;
    // 每位成員的節點中心 Y 應落在「某條與其 level 相符的層線」上（同一套框內位移）。
    for (const m of membersOf(r.nodes, 'g1')) {
      const memberLevel = (m.data as { level: number }).level;
      const centerY = m.position.y + ORG_FLOW_NODE_HEIGHT / 2;
      const line = lines.find((l) => l.level === memberLevel);
      expect(line).toBeDefined();
      // 中心 Y 與層線 y 對齊（兩者皆由 lv.y / topY 推得 → 期望完全相等；
      // 容微小浮點誤差）。
      expect(Math.abs(centerY - line!.y)).toBeLessThan(1);
    }
  });

  it('相鄰 level line 的 y 間距 == 一個層高（ORG_FLOW_LEVEL_GAP）', () => {
    const r = buildGroupOrgGraph(threeLevelOrg(), 'g1');
    const box = boxOf(r.nodes, 'g1')!;
    const ys = box.data.levelLines.map((l) => l.y);
    for (let i = 1; i < ys.length; i++) {
      // 連續層 → topY 差一個 LEVEL_GAP；層線 y = topY + NODE_HEIGHT/2 → 同樣差 LEVEL_GAP。
      expect(Math.abs(ys[i] - ys[i - 1] - ORG_FLOW_LEVEL_GAP)).toBeLessThan(1);
    }
  });

  it('co-leader 平行同層共管：co-leader 與組長同 level → 不額外增生層線', () => {
    // CEO/COO 案：sales leaderId=CEO（不在框）；s1/s2 直屬 CEO（最上層）、
    // COO（co-leader）鉗到同層、s3/s4 落 COO 下一層 → 框內僅兩個相異層級。
    const data = makeOrgData({
      employees: [
        emp('CEO'),
        emp('COO'),
        emp('s1'),
        emp('s2'),
        emp('s3'),
        emp('s4'),
      ],
      groups: [
        group('sales', { leaderId: 'CEO' }),
        group('exec', { leaderId: 'COO' }),
      ],
      assignments: [
        assignment('x-ceo', { employeeId: 'CEO', groupId: 'exec' }),
        assignment('x-coo', {
          employeeId: 'COO',
          groupId: 'exec',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s1', {
          employeeId: 's1',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s2', {
          employeeId: 's2',
          groupId: 'sales',
          supervisorIds: ['CEO'],
          primarySupervisorId: 'CEO',
        }),
        assignment('x-s3', {
          employeeId: 's3',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
        assignment('x-s4', {
          employeeId: 's4',
          groupId: 'sales',
          supervisorIds: ['COO'],
          primarySupervisorId: 'COO',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'sales');
    const box = boxOf(r.nodes, 'sales')!;
    const lines = box.data.levelLines;
    // 框內相異層級數（成員 level 集合）== 層線數。
    const memberLevels = new Set(
      membersOf(r.nodes, 'sales').map(
        (n) => (n.data as { level: number }).level,
      ),
    );
    expect(lines.length).toBe(memberLevels.size);
    // 此案恰兩層（上層 s1/s2/COO；下層 s3/s4）。
    expect(lines.length).toBe(2);
    // 每位成員的 level 都有對應層線（無懸空層、無缺層）。
    for (const lv of memberLevels) {
      expect(lines.some((l) => l.level === lv)).toBe(true);
    }
  });

  it('組間 link 邊（go-link-*）帶 style（stroke + strokeWidth）', () => {
    const data = makeOrgData({
      employees: [emp('p'), emp('c')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-c', { employeeId: 'c', groupId: 'child' }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const link = r.edges.find(
      (e) => e.source === 'group:parent' && e.target === 'group:child',
    );
    expect(link).toBeDefined();
    // edge id 以 go-link- 前綴。
    expect(link!.id).toMatch(/^go-link-/);
    // style 帶 stroke（中性色）與較粗 strokeWidth（區隔組內 reporting 邊）。
    expect(link!.style).toBeDefined();
    expect(link!.style!.stroke).toBeTruthy();
    expect(Number(link!.style!.strokeWidth)).toBeGreaterThan(1);
  });
});
