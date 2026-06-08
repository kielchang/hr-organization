import { describe, expect, it } from 'vitest';
import {
  ALL_GROUPS_VIEW_ID,
  buildGroupOrgGraph,
  snapXToGrid,
  type GroupZoneNodeData,
} from './buildGroupOrgGraph';
import {
  ORG_FLOW_NODE_HEIGHT,
  ORG_FLOW_NODE_SEP,
  ORG_FLOW_NODE_WIDTH,
} from './buildOrgFlowGraph';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';
import type { Node } from '@xyflow/react';

/**
 * buildGroupOrgGraph（D1，重設計）：一張連貫的組織圖 + 同組背景分區。
 *
 * 與舊版（groupBox 容器框 + parentId/extent 子節點 + 框內 levelLines + go-link 框邊）
 * 的差異：
 * - 成員為**攤平的頂層 `employee` 節點**：無 `parentId`、無 `extent`，position 為
 *   **絕對座標**。節點 id 仍作用域化 `${groupId}::${employeeId}`、`data.employee.id`
 *   保留裸 employeeId。
 * - 每組一個 **`groupZone` 背景分區節點**（取代 groupBox）：`zIndex:0`、不可選/拖/連/刪、
 *   data 帶 hue、**無 levelLines**；成員 `zIndex:1`；輸出順序 zone 先、member 後。
 * - **X 欄位網格吸附**：所有成員 `position.x` 量化到 `COLUMN_WIDTH(260)` 格點
 *   （`snapXToGrid`）；同層（同 Y）去重疊 → 同 Y 節點 X 間距 ≥ COLUMN_WIDTH。
 * - 跨組匯報邊 `go-cross-*`（端點分屬不同 cluster）取代框錨點 `go-link-*`；組內邊
 *   `go-${groupId}-e-*`、type='reporting'。
 *
 * 斷言聚焦「結構性不變式」而非絕對像素：分區集合、攤平節點屬性、X 吸附、zIndex/順序、
 * 跨組邊端點、co-lead 同層、防呆。
 */

const ZONE_TYPE = 'groupZone';

/** 與實作同源的欄寬：NODE_WIDTH(200) + NODE_SEP(60) = 260。 */
const COLUMN_WIDTH = ORG_FLOW_NODE_WIDTH + ORG_FLOW_NODE_SEP;

/** 取得某組的 groupZone 背景節點（type='groupZone'、id=`group:${groupId}`）。 */
function zoneOf(
  nodes: Node[],
  groupId: string,
): Node<GroupZoneNodeData> | undefined {
  return nodes.find(
    (n) => n.type === ZONE_TYPE && n.id === `group:${groupId}`,
  ) as Node<GroupZoneNodeData> | undefined;
}

/** 取得作用域化成員節點 id（`${groupId}::${employeeId}`，與實作一致）。 */
function scopedId(groupId: string, employeeId: string): string {
  return `${groupId}::${employeeId}`;
}

/** 所有攤平 employee 節點。 */
function allMembers(nodes: Node[]): Node[] {
  return nodes.filter((n) => n.type === 'employee');
}

/**
 * 某組的成員節點。成員已攤平（無 parentId）→ 以作用域化 id 前綴 `${groupId}::` 篩選。
 */
function membersOf(nodes: Node[], groupId: string): Node[] {
  return nodes.filter(
    (n) => n.type === 'employee' && n.id.startsWith(`${groupId}::`),
  );
}

/**
 * 某分區（groupZone）的絕對矩形 `[left, right] × [top, bottom]`。
 * 取 `style.width/height`（與 `data.width/height` 同源，另有測試守護其一致）。
 */
function zoneRect(zone: Node<GroupZoneNodeData>): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const width = zone.style?.width as number;
  const height = zone.style?.height as number;
  return {
    left: zone.position.x,
    right: zone.position.x + width,
    top: zone.position.y,
    bottom: zone.position.y + height,
  };
}

/**
 * 某成員節點的絕對矩形 `[x, x+NODE_WIDTH] × [y, y+NODE_HEIGHT]`（攤平後絕對座標）。
 */
function memberRect(member: Node): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: member.position.x,
    right: member.position.x + ORG_FLOW_NODE_WIDTH,
    top: member.position.y,
    bottom: member.position.y + ORG_FLOW_NODE_HEIGHT,
  };
}

/**
 * 斷言：某分區的每位成員矩形「完全落在」該分區矩形內（四邊皆不溢出）。
 * 這是 zone 修正（依吸附+去重疊後成員實際 bounding box 回推）的核心回歸守護。
 */
function expectZoneContainsMembers(nodes: Node[], groupId: string): void {
  const zone = zoneOf(nodes, groupId);
  expect(zone, `groupZone for ${groupId}`).toBeDefined();
  const z = zoneRect(zone!);
  const members = membersOf(nodes, groupId);
  for (const m of members) {
    const r = memberRect(m);
    // 四邊皆需包住（含等號：貼齊 padding 邊界視為包住）。
    expect(r.left, `${m.id} left ≥ zone.left`).toBeGreaterThanOrEqual(z.left);
    expect(r.right, `${m.id} right ≤ zone.right`).toBeLessThanOrEqual(z.right);
    expect(r.top, `${m.id} top ≥ zone.top`).toBeGreaterThanOrEqual(z.top);
    expect(r.bottom, `${m.id} bottom ≤ zone.bottom`).toBeLessThanOrEqual(
      z.bottom,
    );
  }
}

/**
 * 取得單一員工節點。成員節點 id 已作用域化（`${groupId}::${employeeId}`），
 * 裸 employeeId 仍保留在 `node.data.employee.id` → 以此還原查找。
 * 同員工跨多組時可指定 groupId 精確定位某分區內節點。
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
      (groupId == null || n.id === scopedId(groupId, employeeId)),
  );
}

describe('snapXToGrid 純函式', () => {
  it('把 X 吸附到最近的 COLUMN_WIDTH(260) 倍數', () => {
    // 各輸入 → 最近 260 倍數（四捨五入）。
    expect(snapXToGrid(0)).toBe(0);
    expect(snapXToGrid(129)).toBe(0); // 129 < 130 → 取 0
    expect(snapXToGrid(130)).toBe(260); // 130 = 半格 → 進位
    expect(snapXToGrid(131)).toBe(260);
    expect(snapXToGrid(260)).toBe(260);
    expect(snapXToGrid(389)).toBe(260); // 389 < 390 → 取 260
    expect(snapXToGrid(390)).toBe(520);
    expect(snapXToGrid(521)).toBe(520);
  });

  it('負值吸附（Math.round 半數朝 +∞ → -0.5 進位到 0）', () => {
    // Math.round(-0.5) === -0（朝 +∞），故 -130 吸附到 0、-131 才到 -260。
    expect(snapXToGrid(-130)).toBe(-0);
    expect(snapXToGrid(-131)).toBe(-260);
    expect(snapXToGrid(-129)).toBe(-0);
    expect(snapXToGrid(-260)).toBe(-260);
    expect(snapXToGrid(-391)).toBe(-520);
  });

  it('輸出恆為 COLUMN_WIDTH 的整數倍', () => {
    for (const x of [0, 17, 123, 260, 333, 517, 781, 1040, 1299]) {
      expect(snapXToGrid(x) % COLUMN_WIDTH).toBe(0);
    }
  });

  it('為純函式：不修改輸入、同輸入同輸出', () => {
    const x = 333;
    expect(snapXToGrid(x)).toBe(snapXToGrid(x));
    expect(x).toBe(333);
  });
});

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

  it('空組（無成員）→ 仍有一個空分區、無成員節點', () => {
    const data = makeOrgData({
      groups: [group('g1')],
      assignments: [],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.error).toBeUndefined();
    expect(zoneOf(r.nodes, 'g1')).toBeDefined();
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

describe('buildGroupOrgGraph 背景分區集合（groupZone）', () => {
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

  it('ALL 視角：每個 active 組一個分區（停用組不顯示）', () => {
    const r = buildGroupOrgGraph(org(), ALL_GROUPS_VIEW_ID);
    const zoneIds = r.nodes
      .filter((n) => n.type === ZONE_TYPE)
      .map((n) => n.id)
      .sort();
    // g1/g3 active → 兩分區；g2 停用 → 不顯示。
    expect(zoneIds).toEqual(['group:g1', 'group:g3']);
  });

  it('單組視角：只有該組一個分區', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const zones = r.nodes.filter((n) => n.type === ZONE_TYPE);
    expect(zones).toHaveLength(1);
    expect(zones[0].id).toBe('group:g1');
  });

  it('停用組的成員不出現在 ALL 視角', () => {
    const r = buildGroupOrgGraph(org(), ALL_GROUPS_VIEW_ID);
    expect(memberNode(r.nodes, 'out')).toBeUndefined();
  });

  it('groupZone 節點帶 data（groupId/groupName/kind/leaderId/coLeaderIds/尺寸/hue）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    expect(zone.data.groupId).toBe('g1');
    expect(zone.data.groupName).toBe('g1');
    expect(zone.data.kind).toBe('department');
    // 無顯式 leaderId → 回退組內匯報根 boss。
    expect(zone.data.leaderId).toBe('boss');
    expect(zone.data.coLeaderIds).toEqual([]);
    expect(zone.data.width).toBeGreaterThan(0);
    expect(zone.data.height).toBeGreaterThan(0);
    // 分區淡色色相（0–360）。
    expect(typeof zone.data.hue).toBe('number');
    expect(zone.data.hue).toBeGreaterThanOrEqual(0);
    expect(zone.data.hue).toBeLessThanOrEqual(360);
  });

  it('groupZone 為背景、低層、不互動（zIndex:0、不可選/拖/連/刪）、無 levelLines', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    expect(zone.zIndex).toBe(0);
    expect(zone.selectable).toBe(false);
    expect(zone.draggable).toBe(false);
    expect(zone.connectable).toBe(false);
    expect(zone.deletable).toBe(false);
    // 重設計移除框內層級輔助線。
    expect('levelLines' in (zone.data as Record<string, unknown>)).toBe(false);
  });

  it('groupZone style.width/height 與 data.width/height 一致', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    expect(zone.style?.width).toBe(zone.data.width);
    expect(zone.style?.height).toBe(zone.data.height);
  });

  it('ALL 視角各分區 hue 不同（相鄰組以不同色相區隔）', () => {
    const r = buildGroupOrgGraph(org(), ALL_GROUPS_VIEW_ID);
    const hues = r.nodes
      .filter((n) => n.type === ZONE_TYPE)
      .map((n) => (n.data as GroupZoneNodeData).hue);
    // g1/g3 兩分區 → 兩個相異 hue。
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe('buildGroupOrgGraph 成員為攤平頂層節點', () => {
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

  it('成員為頂層節點：無 parentId、無 extent、type==="employee"', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const members = membersOf(r.nodes, 'g1');
    expect(members).toHaveLength(3);
    for (const m of members) {
      expect(m.parentId).toBeUndefined();
      expect(m.extent).toBeUndefined();
      expect(m.type).toBe('employee');
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

  it('成員節點 zIndex:1（疊在分區之上）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    for (const m of membersOf(r.nodes, 'g1')) {
      expect(m.zIndex).toBe(1);
    }
  });

  it('成員節點帶該員 assignmentId（非空）；diffMap 帶入 diffStatus', () => {
    const diffMap = new Map([['boss', 'modified' as const]]);
    const r = buildGroupOrgGraph(org(), 'g1', diffMap);
    const boss = memberNode(r.nodes, 'boss')!;
    expect((boss.data as { assignmentId: string }).assignmentId).toBe('a-boss');
    expect((boss.data as { diffStatus?: string }).diffStatus).toBe('modified');
  });
});

describe('buildGroupOrgGraph X 欄位網格吸附', () => {
  /** boss ← {mid1, mid2, mid3}：第二層三人 → 同層多節點檢驗去重疊。 */
  function wideOrg() {
    return makeOrgData({
      employees: [emp('boss'), emp('mid1'), emp('mid2'), emp('mid3')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        assignment('a-mid1', {
          employeeId: 'mid1',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-mid2', {
          employeeId: 'mid2',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-mid3', {
          employeeId: 'mid3',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
  }

  /** 跨多組（ALL 視角）：驗證全圖共用刻度、跨組成員 X 皆在格點。 */
  function multiGroupOrg() {
    return makeOrgData({
      employees: [
        emp('p'),
        emp('pc'),
        emp('c'),
        emp('cc'),
        emp('a'),
        emp('b'),
      ],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
        group('fn', { kind: 'function', parentId: null }),
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
        assignment('a-a', { employeeId: 'a', groupId: 'fn' }),
        assignment('a-b', {
          employeeId: 'b',
          groupId: 'fn',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
  }

  it('單組：所有成員 position.x 為 COLUMN_WIDTH(260) 倍數', () => {
    const r = buildGroupOrgGraph(wideOrg(), 'g1');
    for (const m of membersOf(r.nodes, 'g1')) {
      expect(m.position.x % COLUMN_WIDTH).toBe(0);
    }
  });

  it('ALL 視角（跨組）：全圖所有成員 position.x 皆為 COLUMN_WIDTH(260) 倍數', () => {
    const r = buildGroupOrgGraph(multiGroupOrg(), ALL_GROUPS_VIEW_ID);
    const members = allMembers(r.nodes);
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) {
      expect(m.position.x % COLUMN_WIDTH).toBe(0);
    }
  });

  it('同層（同 Y）不重疊：同 Y 節點相鄰 X 間距 ≥ COLUMN_WIDTH', () => {
    const r = buildGroupOrgGraph(wideOrg(), 'g1');
    const byY = new Map<number, number[]>();
    for (const m of allMembers(r.nodes)) {
      const arr = byY.get(m.position.y) ?? [];
      arr.push(m.position.x);
      byY.set(m.position.y, arr);
    }
    for (const xs of byY.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        // 去重疊後相鄰 X 間距至少一格欄寬（且仍在格點上）。
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(COLUMN_WIDTH);
      }
    }
  });

  it('同層 X 皆相異（去重疊後同 Y 無兩節點重合）', () => {
    const r = buildGroupOrgGraph(wideOrg(), 'g1');
    const byY = new Map<number, number[]>();
    for (const m of allMembers(r.nodes)) {
      const arr = byY.get(m.position.y) ?? [];
      arr.push(m.position.x);
      byY.set(m.position.y, arr);
    }
    for (const xs of byY.values()) {
      expect(new Set(xs).size).toBe(xs.length);
    }
  });

  it('ALL 視角同層去重疊：每個層帶內 X 兩兩間距 ≥ COLUMN_WIDTH 且皆在格點', () => {
    const r = buildGroupOrgGraph(multiGroupOrg(), ALL_GROUPS_VIEW_ID);
    const byY = new Map<number, number[]>();
    for (const m of allMembers(r.nodes)) {
      const arr = byY.get(m.position.y) ?? [];
      arr.push(m.position.x);
      byY.set(m.position.y, arr);
    }
    for (const xs of byY.values()) {
      xs.sort((a, b) => a - b);
      for (const x of xs) expect(x % COLUMN_WIDTH).toBe(0);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(COLUMN_WIDTH);
      }
    }
  });
});

describe('buildGroupOrgGraph 輸出順序（zone 先、member 後）', () => {
  it('所有 groupZone 節點排在所有 employee 節點之前', () => {
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
    const lastZoneIdx = r.nodes.reduce(
      (acc, n, i) => (n.type === ZONE_TYPE ? i : acc),
      -1,
    );
    const firstMemberIdx = r.nodes.findIndex((n) => n.type === 'employee');
    expect(lastZoneIdx).toBeGreaterThanOrEqual(0);
    expect(firstMemberIdx).toBeGreaterThanOrEqual(0);
    // 最後一個 zone 仍在第一個 member 之前。
    expect(lastZoneIdx).toBeLessThan(firstMemberIdx);
  });

  it('zone zIndex(0) < member zIndex(1)：成員視覺疊於分區之上', () => {
    const data = makeOrgData({
      employees: [emp('boss')],
      groups: [group('g1')],
      assignments: [assignment('a-boss', { employeeId: 'boss', groupId: 'g1' })],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    const boss = memberNode(r.nodes, 'boss')!;
    expect(zone.zIndex).toBeLessThan(boss.zIndex as number);
  });
});

describe('buildGroupOrgGraph ALL 視角節點 id 唯一（作用域化）', () => {
  /**
   * 同一員工跨多組（含 co-leader 被納入多分區）→ 全圖成員節點 id 必須唯一。
   *
   * 佈局：
   * - dual 同時隸屬 g1 與 g2（兩組各一筆 assignment）→ 跨組同員工。
   * - boss 任職 hq、為 hq 組長（isLeadLevel 夠格），且是 g1、g2 兩組成員的**組外
   *   primary 主管**；g1/g2 的 leaderId 各為本組成員（a0/b0，非 boss）→ boss 對
   *   g1、g2 皆符合 co-leader 條件 → boss 同時被納入 g1、g2 兩分區。
   *
   * 期望：用裸 employeeId 會在多分區產生相同 id；實作以 `${groupId}::${employeeId}`
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
        assignment('h-boss', { employeeId: 'boss', groupId: 'hq' }),
        assignment('d-g1', { employeeId: 'dual', groupId: 'g1' }),
        assignment('d-g2', {
          employeeId: 'dual',
          groupId: 'g2',
          isPrimaryGroup: false,
        }),
        assignment('a0-g1', { employeeId: 'a0', groupId: 'g1' }),
        assignment('a1-g1', {
          employeeId: 'a1',
          groupId: 'g1',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
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
    for (const n of allMembers(r.nodes)) {
      const empId = (n.data as { employee: { id: string } }).employee.id;
      // id 末段為裸 employeeId、前綴為 `${groupId}::`。
      expect(n.id.endsWith(`::${empId}`)).toBe(true);
      const gid = n.id.slice(0, n.id.length - `::${empId}`.length);
      expect(n.id).toBe(scopedId(gid, empId));
    }
  });

  it('同員工跨多組（含 co-leader 納入多分區）→ 節點 id 集合大小 == 成員節點數（無重撞）', () => {
    const r = buildGroupOrgGraph(crossGroupOrg(), ALL_GROUPS_VIEW_ID);
    const members = allMembers(r.nodes);
    const ids = members.map((n) => n.id);
    expect(new Set(ids).size).toBe(members.length);

    // 實證確有「同一裸 employeeId 出現在多分區」（否則此測試無鑑別力）。
    const dualNodes = members.filter(
      (n) => (n.data as { employee: { id: string } }).employee.id === 'dual',
    );
    const bossNodes = members.filter(
      (n) => (n.data as { employee: { id: string } }).employee.id === 'boss',
    );
    expect(dualNodes.length).toBeGreaterThanOrEqual(2);
    expect(bossNodes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(dualNodes.map((n) => n.id)).size).toBe(dualNodes.length);
    expect(new Set(bossNodes.map((n) => n.id)).size).toBe(bossNodes.length);
  });

  it('裸 employeeId 仍保留在 node.data.employee.id（供 D2 選取/diff 還原）', () => {
    const r = buildGroupOrgGraph(crossGroupOrg(), ALL_GROUPS_VIEW_ID);
    const dualG1 = memberNode(r.nodes, 'dual', 'g1')!;
    const dualG2 = memberNode(r.nodes, 'dual', 'g2')!;
    expect(dualG1.id).not.toBe(dualG2.id);
    expect((dualG1.data as { employee: { id: string } }).employee.id).toBe('dual');
    expect((dualG2.data as { employee: { id: string } }).employee.id).toBe('dual');
  });
});

describe('buildGroupOrgGraph co-leader 納入分區與同層', () => {
  /**
   * CEO/COO 案：sales 組 leaderId=CEO（CEO 本人不在 sales）。
   * 成員 s1/s2 主管 CEO；s3/s4 主管 COO（COO 組外、是 exec 組 leaderId → 夠格）。
   * → COO 為 co-leader、納入 sales 分區、與 leader（s1/s2 同層）同層。
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

  it('co-leader（組外主管）納入分區作為成員節點', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const empIds = membersOf(r.nodes, 'sales')
      .map((n) => (n.data as { employee: { id: string } }).employee.id)
      .sort();
    expect(empIds).toEqual(['COO', 's1', 's2', 's3', 's4']);
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
    const s3 = memberNode(r.nodes, 's3')!;
    expect((s3.data as { assignmentId: string }).assignmentId).toBe('x-s3');
  });

  it('co-leader 部屬（s3/s4）落在 co-leader（COO）下一層（非與組長同層）', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const lv = (id: string) =>
      (memberNode(r.nodes, id)!.data as { level: number }).level;
    expect(lv('s3')).toBe(lv('COO') + 1);
    expect(lv('s4')).toBe(lv('COO') + 1);
    expect(lv('s3')).toBeGreaterThan(lv('COO'));
  });

  it('co-lead 與「組長同層」：COO（co-leader）與 s1/s2 同層（同 level）', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    const lv = (id: string) =>
      (memberNode(r.nodes, id)!.data as { level: number }).level;
    expect(lv('COO')).toBe(lv('s1'));
    expect(lv('COO')).toBe(lv('s2'));
  });

  it('co-lead 與 leader 同 Y（同層 → applyLevelBands 同一 Y 帶）', () => {
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
    expect(lvl('coLead')).toBe(lvl('lead'));
    // 同層級 → 同 Y（攤平後絕對座標仍同層帶 Y）。
    expect(node('coLead').position.y).toBe(node('lead').position.y);
    expect(lvl('m2')).toBe(lvl('coLead') + 1);
  });

  it('成員節點數 = 成員數 + 納入的 co-leader 數', () => {
    const r = buildGroupOrgGraph(ceoCooOrg(), 'sales');
    // sales 成員 = {s1,s2,s3,s4}=4；納入 co-leader COO=1 → 共 5。
    expect(membersOf(r.nodes, 'sales')).toHaveLength(5);
  });
});

describe('buildGroupOrgGraph 組長置頂（leaderId 為根的 top-down BFS）', () => {
  /**
   * 組內層級精煉：層級骨架改「以組長（`leaderId`）+ co-leaders 為根（level 1）的
   * top-down BFS」——取代舊「以 computePrimaryDepth 求組內匯報根再置頂」。
   *
   * 規則（與實作 layoutIntraGroup 對齊）：
   * - 根集合 = {leaderId} ∪ {co-leaders} → 皆 level 1（頂，且同 Y 帶平行同層共管）。
   * - 其餘成員：由根集合沿「組內 primary 主管 → 部屬」往下 BFS，逐層 +1。
   * - 無法從根集合到達者（鏈不指向根、或主管在組外且非 co-lead）→ level 1（斷開/待確認）。
   * - leaderId 為 null 時 fallback：以 computePrimaryDepth（組內匯報根=1）置頂，維持可用。
   *
   * 斷言聚焦「層級數值（level）與同 Y 帶」的結構不變式，不驗絕對像素。
   */

  /** 取某員工攤平節點的 level。 */
  function levelOf(nodes: Node[], employeeId: string, groupId?: string): number {
    return (memberNode(nodes, employeeId, groupId)!.data as { level: number })
      .level;
  }

  it('顯式組長置頂：leaderId 指定的人為 level 1（即使其在組內匯報鏈中非根）', () => {
    // sales leaderId=mgr（顯式）。匯報鏈：boss ← mgr ← staff（boss 為匯報根、非組長）。
    // 舊行為（匯報根置頂）：boss=1。新行為（組長置頂）：mgr=1（組長為根）。
    const data = makeOrgData({
      employees: [emp('boss'), emp('mgr'), emp('staff')],
      groups: [group('sales', { leaderId: 'mgr' })],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'sales' }),
        assignment('a-mgr', {
          employeeId: 'mgr',
          groupId: 'sales',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
        assignment('a-staff', {
          employeeId: 'staff',
          groupId: 'sales',
          supervisorIds: ['mgr'],
          primarySupervisorId: 'mgr',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'sales');
    // 組長 mgr 為 level 1（頂）。
    expect(levelOf(r.nodes, 'mgr')).toBe(1);
    // 由組長往下：staff（主管 mgr）= level 2。
    expect(levelOf(r.nodes, 'staff')).toBe(levelOf(r.nodes, 'mgr') + 1);
    // boss 的 primary 主管不在「組長子樹」中（boss 是 mgr 的上級、非部屬）→ BFS 觸及不到
    // → 落 level 1（與組長並排，斷開/待確認）。
    expect(levelOf(r.nodes, 'boss')).toBe(1);
  });

  it('子樹成員 = 主管 level + 1（沿組長往下逐層遞增）', () => {
    // sales leaderId=lead；lead ← a ← b 線性子樹。
    const data = makeOrgData({
      employees: [emp('lead'), emp('a'), emp('b')],
      groups: [group('sales', { leaderId: 'lead' })],
      assignments: [
        assignment('x-lead', { employeeId: 'lead', groupId: 'sales' }),
        assignment('x-a', {
          employeeId: 'a',
          groupId: 'sales',
          supervisorIds: ['lead'],
          primarySupervisorId: 'lead',
        }),
        assignment('x-b', {
          employeeId: 'b',
          groupId: 'sales',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'sales');
    expect(levelOf(r.nodes, 'lead')).toBe(1);
    expect(levelOf(r.nodes, 'a')).toBe(2);
    expect(levelOf(r.nodes, 'b')).toBe(3);
  });

  it('組長 + co-leaders 皆 level 1 且同 Y（平行同層共管）', () => {
    // sales leaderId=lead（組內）；成員 m2 主管 coLead（組外、exec 組長 → 夠格 co-leader）。
    const data = makeOrgData({
      employees: [emp('lead'), emp('coLead'), emp('m'), emp('m2')],
      groups: [group('sales', { leaderId: 'lead' }), group('exec', { leaderId: 'coLead' })],
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
    // co-leader（coLead）被推導為 sales 共管 → 納入分區。
    expect(r.leadership.get('sales')?.coLeaderIds).toContain('coLead');
    // 組長與 co-leader 皆 level 1。
    expect(levelOf(r.nodes, 'lead', 'sales')).toBe(1);
    expect(levelOf(r.nodes, 'coLead', 'sales')).toBe(1);
    // 同層 → 同 Y 帶。
    expect(memberNode(r.nodes, 'coLead', 'sales')!.position.y).toBe(
      memberNode(r.nodes, 'lead', 'sales')!.position.y,
    );
  });

  it('斷開成員（主管在組外且非 co-lead）落 level 1（與組長並排）', () => {
    // sales leaderId=lead（組內）；成員 orphan 主管 extMgr 在組外、且「不夠格」
    //（extMgr 主歸屬掛 topBoss、非任何組長）→ 不被推成 co-leader → BFS 觸及不到 → level 1。
    const data = makeOrgData({
      employees: [emp('lead'), emp('topBoss'), emp('extMgr'), emp('orphan')],
      groups: [
        group('sales', { leaderId: 'lead' }),
        group('other', { kind: 'department' }),
      ],
      assignments: [
        assignment('x-lead', { employeeId: 'lead', groupId: 'sales' }),
        assignment('x-top', { employeeId: 'topBoss', groupId: 'other' }),
        assignment('x-ext', {
          employeeId: 'extMgr',
          groupId: 'other',
          supervisorIds: ['topBoss'],
          primarySupervisorId: 'topBoss',
        }),
        assignment('x-orphan', {
          employeeId: 'orphan',
          groupId: 'sales',
          supervisorIds: ['extMgr'],
          primarySupervisorId: 'extMgr',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'sales');
    // extMgr 不是 sales co-leader（不夠格）→ orphan 鏈不指向 sales 根 → 落 level 1。
    expect(r.leadership.get('sales')?.coLeaderIds).not.toContain('extMgr');
    expect(levelOf(r.nodes, 'orphan', 'sales')).toBe(1);
    expect(levelOf(r.nodes, 'lead', 'sales')).toBe(1);
    // 斷開成員與組長並排同 Y。
    expect(memberNode(r.nodes, 'orphan', 'sales')!.position.y).toBe(
      memberNode(r.nodes, 'lead', 'sales')!.position.y,
    );
  });

  it('無顯式 leaderId → 推導回退組內匯報根並置頂（boss 第1層、其下遞增）', () => {
    // 無顯式 group.leaderId、boss 為唯一組內匯報根 → deriveGroupLeadership 回退 boss
    // 為 leaderId（單一候選）→ 仍走「組長置頂」top-down BFS：boss=1、mid=2、low=3。
    const data = makeOrgData({
      employees: [emp('boss'), emp('mid'), emp('low')],
      groups: [group('g1')], // 無 leaderId
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
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.leadership.get('g1')?.leaderId).toBe('boss');
    expect(levelOf(r.nodes, 'boss')).toBe(1);
    expect(levelOf(r.nodes, 'mid')).toBe(2);
    expect(levelOf(r.nodes, 'low')).toBe(3);
  });

  it('雙匯報根（無顯式 leaderId）→ 推得唯一組長置頂；另一根不在其子樹 → 落 level 1', () => {
    // a、c 皆無上級（兩匯報根）；deriveInGroupRoot deterministic tiebreak（深度同→部屬數同
    //（各 1）→ employeeId 升冪）→ 取 a 為組長。top-down BFS 自 a：a=1、b（主管 a）=2；
    // c 不在 a 子樹（c 為獨立根）→ 落 level 1；d（主管 c）亦 BFS 觸及不到 → 落 level 1。
    const data = makeOrgData({
      employees: [emp('a'), emp('b'), emp('c'), emp('d')],
      groups: [group('g1')],
      assignments: [
        assignment('a-a', { employeeId: 'a', groupId: 'g1' }),
        assignment('a-b', {
          employeeId: 'b',
          groupId: 'g1',
          supervisorIds: ['a'],
          primarySupervisorId: 'a',
        }),
        assignment('a-c', { employeeId: 'c', groupId: 'g1' }),
        assignment('a-d', {
          employeeId: 'd',
          groupId: 'g1',
          supervisorIds: ['c'],
          primarySupervisorId: 'c',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    // 雙匯報根經 deterministic tiebreak 推得組長 a（非 null；候選>0 → 不走 null fallback）。
    expect(r.leadership.get('g1')?.leaderId).toBe('a');
    expect(levelOf(r.nodes, 'a')).toBe(1);
    expect(levelOf(r.nodes, 'b')).toBe(2);
    // 另一獨立根 c 不在組長 a 子樹 → 斷開落 level 1；其部屬 d 亦觸及不到 → level 1。
    expect(levelOf(r.nodes, 'c')).toBe(1);
    expect(levelOf(r.nodes, 'd')).toBe(1);
  });

  it('leaderId 為 null 的 fallback 路徑：空組（無成員 → leaderId null）不崩壞、無成員節點', () => {
    // 非空組經推導必得非 null leaderId（候選>0）；leaderId===null 的 fallback 分支在實務上
    // 僅空組可達（無成員 → 無節點需佈局）。守護該分支不丟錯、輸出空成員集合。
    const data = makeOrgData({ groups: [group('g1')] });
    const r = buildGroupOrgGraph(data, 'g1');
    expect(r.error).toBeUndefined();
    expect(r.leadership.get('g1')?.leaderId).toBeNull();
    expect(membersOf(r.nodes, 'g1')).toHaveLength(0);
  });
});

describe('buildGroupOrgGraph 組內匯報邊', () => {
  /**
   * 組內成員匯報邊：type='reporting'、edge id `go-${groupId}-e-*`、端點為作用域化 id
   * （`${groupId}::${employeeId}`，與成員節點 id 一致）、`data.isPrimary` 標主/次匯報。
   */
  it('組內匯報邊：type=reporting、端點為作用域化 id、data.isPrimary、id 帶組前綴', () => {
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
    const intra = r.edges.find(
      (e) =>
        e.source === scopedId('g1', 'boss') &&
        e.target === scopedId('g1', 'mid'),
    );
    expect(intra).toBeDefined();
    expect(intra!.type).toBe('reporting');
    expect(intra!.id).toMatch(/^go-g1-e-/);
    expect((intra!.data as { isPrimary: boolean }).isPrimary).toBe(true);
    // 端點 id 與實際成員節點 id 對得上（非懸空邊）。
    const ids = new Set(membersOf(r.nodes, 'g1').map((n) => n.id));
    expect(ids.has(intra!.source)).toBe(true);
    expect(ids.has(intra!.target)).toBe(true);
    // 單組視角無跨組邊（無別組）→ edges 僅該組內邊。
    expect(r.edges).toHaveLength(1);
  });

  it('組內次匯報邊（非 primary supervisor）→ data.isPrimary=false（虛線）', () => {
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
});

describe('buildGroupOrgGraph 組長鏈（go-leaderlink-*）', () => {
  /**
   * 組別層級精煉：移除舊「任意跨組成員匯報邊」`go-cross-*`，改以「組長鏈」表達組間
   * 上下關係——層級骨架依「組別管理」（組的上下＝`Group.parentId`、各組頂點＝組長
   * `leaderId`）。故組間僅以一條「父組組長 → 子組組長」邊呈現：
   * - id 前綴 `go-leaderlink-`、`type='reporting'`、`data.label='組別階層'`；
   * - 端點為兩組各自 `leaderId` 對應的攤平成員節點 id（作用域化 `${groupId}::${leaderId}`），
   *   source=父組組長、target=子組組長；
   * - 子組或父組 `leaderId` 為 null、或父組未在顯示集合內 → 跳過該鏈（不畫）。
   *
   * 同時守護「不再有任何 `go-cross-*`」與「無框錨點 `go-link-*` / group:→group: 邊」。
   *
   * 案例：parent 組成員 p（組內無上級 → 推導為 parent 組長）；child 組（parentId=parent）
   * 成員 c（c 為 child 組內匯報根 → 推導為 child 組長）→ 應有一條
   * parent 組長(p) → child 組長(c) 的組長鏈。
   */
  function crossOrg() {
    return makeOrgData({
      employees: [emp('p'), emp('c')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-c', {
          employeeId: 'c',
          groupId: 'child',
          // 跨組主管 p 不再產生成員層級跨組邊；組間關係改由組長鏈表達。
          supervisorIds: ['p'],
          primarySupervisorId: 'p',
        }),
      ],
    });
  }

  it('父子組各有組長 → go-leaderlink-* 邊：source=父組長、target=子組長、type=reporting、label「組別階層」', () => {
    const r = buildGroupOrgGraph(crossOrg(), ALL_GROUPS_VIEW_ID);
    // 推導組長：parent→p（組內匯報根）、child→c（組內匯報根）。
    expect(r.leadership.get('parent')?.leaderId).toBe('p');
    expect(r.leadership.get('child')?.leaderId).toBe('c');

    const link = r.edges.find((e) => e.id.startsWith('go-leaderlink-'));
    expect(link).toBeDefined();
    expect(link!.type).toBe('reporting');
    // source=父組組長、target=子組組長（作用域化、分屬不同 cluster）。
    expect(link!.source).toBe(scopedId('parent', 'p'));
    expect(link!.target).toBe(scopedId('child', 'c'));
    const srcGroup = (link!.source as string).split('::')[0];
    const tgtGroup = (link!.target as string).split('::')[0];
    expect(srcGroup).toBe('parent');
    expect(tgtGroup).toBe('child');
    // 中性 label 與組內「主匯報」區隔語意。
    expect((link!.data as { label: string }).label).toBe('組別階層');
    // 端點對得上實際成員節點（非懸空邊）。
    const ids = new Set(allMembers(r.nodes).map((n) => n.id));
    expect(ids.has(link!.source)).toBe(true);
    expect(ids.has(link!.target)).toBe(true);
  });

  it('已無任何 go-cross-* 成員跨組邊（改以組長鏈表達組間關係）', () => {
    const r = buildGroupOrgGraph(crossOrg(), ALL_GROUPS_VIEW_ID);
    expect(r.edges.some((e) => e.id.startsWith('go-cross-'))).toBe(false);
    // 組間僅由組長鏈表達：唯一一條跨 cluster 邊即 go-leaderlink-*。
    const crossClusterEdges = r.edges.filter((e) => {
      const s = (e.source as string).split('::')[0];
      const t = (e.target as string).split('::')[0];
      return s !== t;
    });
    expect(crossClusterEdges).toHaveLength(1);
    expect(crossClusterEdges[0].id).toMatch(/^go-leaderlink-/);
  });

  it('無 go-link-* 框錨點邊；無 group:→group: 框邊', () => {
    const r = buildGroupOrgGraph(crossOrg(), ALL_GROUPS_VIEW_ID);
    expect(r.edges.some((e) => e.id.startsWith('go-link-'))).toBe(false);
    const groupToGroup = r.edges.filter(
      (e) =>
        typeof e.source === 'string' &&
        e.source.startsWith('group:') &&
        typeof e.target === 'string' &&
        e.target.startsWith('group:'),
    );
    expect(groupToGroup).toHaveLength(0);
  });

  it('無 type=default 邊（框錨點邊已移除）；組長鏈亦為 reporting', () => {
    const r = buildGroupOrgGraph(crossOrg(), ALL_GROUPS_VIEW_ID);
    expect(r.edges.some((e) => e.type === 'default')).toBe(false);
    // 所有邊皆為 reporting（含組內邊與組長鏈）。
    for (const e of r.edges) {
      expect(e.type).toBe('reporting');
    }
  });

  it('父組未在顯示集合內（單組視角）→ 無組長鏈（不指向未顯示父組）', () => {
    // 單看 child 組：父組 parent 不顯示 → 組長鏈須跳過（parentId 不在顯示集合內）。
    const r = buildGroupOrgGraph(crossOrg(), 'child');
    expect(r.edges.some((e) => e.id.startsWith('go-leaderlink-'))).toBe(false);
    // 亦無任何跨組殘留邊（單組視角僅該組內邊）。
    expect(r.edges.some((e) => e.id.startsWith('go-cross-'))).toBe(false);
  });

  it('子組或父組 leaderId 為 null（空組無組長）→ 跳過該組長鏈', () => {
    // parent 有組長 p；child 為空組（無成員 → leaderId fallback 亦為 null）→ 跳過鏈。
    const data = makeOrgData({
      employees: [emp('p')],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [assignment('a-p', { employeeId: 'p', groupId: 'parent' })],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    expect(r.leadership.get('child')?.leaderId).toBeNull();
    expect(r.edges.some((e) => e.id.startsWith('go-leaderlink-'))).toBe(false);
  });

  it('多層父子鏈（grand→parent→child）→ 各相鄰層一條組長鏈、端點皆為對應組長', () => {
    // grand←parent←child 三層部門，各組各一名組長。
    const data = makeOrgData({
      employees: [emp('g'), emp('p'), emp('c')],
      groups: [
        group('grand', { kind: 'department' }),
        group('parent', { kind: 'department', parentId: 'grand' }),
        group('child', { kind: 'department', parentId: 'parent' }),
      ],
      assignments: [
        assignment('a-g', { employeeId: 'g', groupId: 'grand' }),
        assignment('a-p', { employeeId: 'p', groupId: 'parent' }),
        assignment('a-c', { employeeId: 'c', groupId: 'child' }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const links = r.edges.filter((e) => e.id.startsWith('go-leaderlink-'));
    // grand→parent 與 parent→child 各一條。
    expect(links).toHaveLength(2);
    const pairs = links
      .map((e) => `${e.source}→${e.target}`)
      .sort();
    expect(pairs).toEqual(
      [
        `${scopedId('grand', 'g')}→${scopedId('parent', 'p')}`,
        `${scopedId('parent', 'p')}→${scopedId('child', 'c')}`,
      ].sort(),
    );
  });

  it('function 組（parentId=null、彼此無父子關係）→ 無組長鏈、無 go-cross-*', () => {
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
    expect(r.edges.some((e) => e.id.startsWith('go-leaderlink-'))).toBe(false);
    expect(r.edges.some((e) => e.id.startsWith('go-cross-'))).toBe(false);
  });

  it('所有 edge id 全域唯一（組內 go-${g}-e-* + 組長鏈 go-leaderlink-* 不重撞）', () => {
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
        assignment('a-c', {
          employeeId: 'c',
          groupId: 'child',
          supervisorIds: ['pc'],
          primarySupervisorId: 'pc',
        }),
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
    // 同時涵蓋組內 reporting（go-${g}-e-*）與組長鏈 reporting（go-leaderlink-*）兩類邊。
    expect(r.edges.some((e) => e.id.startsWith('go-leaderlink-'))).toBe(true);
    expect(r.edges.some((e) => /^go-[^l].*-e-/.test(e.id))).toBe(true);
    // 已無 go-cross-*。
    expect(r.edges.some((e) => e.id.startsWith('go-cross-'))).toBe(false);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });
});

describe('buildGroupOrgGraph 分區尺寸與成員座標', () => {
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

  it('成員為絕對座標（非相對分區）：position 可大於分區 width（不再以 extent 鉗住）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    // 單組時 cluster 位移可能為負或正；只驗證成員為頂層、座標為數值。
    for (const m of membersOf(r.nodes, 'g1')) {
      expect(typeof m.position.x).toBe('number');
      expect(typeof m.position.y).toBe('number');
      expect(m.parentId).toBeUndefined();
    }
  });

  it('成員 Y 為層帶：同層成員同 Y、相鄰層 Y 差一個層高', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const yOf = (id: string) => memberNode(r.nodes, id)!.position.y;
    // boss / mid / low 三層 → 三個相異 Y、嚴格遞增。
    const ys = [yOf('boss'), yOf('mid'), yOf('low')];
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    // 相鄰層 Y 差一致（層帶等距）。
    expect(ys[1] - ys[0]).toBe(ys[2] - ys[1]);
  });

  it('分區尺寸 ≥ 一個節點寬高（容納成員）', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    expect(zone.data.width).toBeGreaterThanOrEqual(ORG_FLOW_NODE_WIDTH);
    expect(zone.data.height).toBeGreaterThanOrEqual(ORG_FLOW_NODE_HEIGHT);
  });

  it('空組分區仍有合理最小尺寸（>0）', () => {
    const data = makeOrgData({ groups: [group('g1')] });
    const r = buildGroupOrgGraph(data, 'g1');
    const zone = zoneOf(r.nodes, 'g1')!;
    expect(zone.data.width).toBeGreaterThan(0);
    expect(zone.data.height).toBeGreaterThan(0);
  });

  it('leadership Map 涵蓋顯示組、帶 leaderId/coLeaderIds', () => {
    const r = buildGroupOrgGraph(org(), 'g1');
    expect([...r.leadership.keys()]).toEqual(['g1']);
    const lead = r.leadership.get('g1')!;
    expect(lead.leaderId).toBe('boss');
    expect(lead.coLeaderIds).toEqual([]);
  });
});

describe('buildGroupOrgGraph 分區包住成員（zone-containment 回歸守護）', () => {
  /**
   * zone 修正：`groupZone` 的 position/width/height 改為「**依吸附 + 同層去重疊後成員
   * 實際 bounding box 回推**」（不再用吸附前 cluster 尺寸）。
   * 不變式：每位成員的矩形 `[x, x+NODE_WIDTH] × [y, y+NODE_HEIGHT]` **完全落在**其分區
   * 矩形內（四邊皆不溢出）。下列各情境皆以 {@link expectZoneContainsMembers} 驗證。
   *
   * 主要破口為「**窄分區成員被同層去重疊往右推**」——推後分區右緣仍須包住該成員。
   */

  /** boss ← mid ← low 單一深鏈：基本包容（單組、無外力位移）。 */
  function chainOrg() {
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

  it('單組多層：每位成員完全落在分區內', () => {
    const r = buildGroupOrgGraph(chainOrg(), 'g1');
    expectZoneContainsMembers(r.nodes, 'g1');
  });

  it('寬分區（同層多子）：第二層 fan-out 成員皆落在分區內', () => {
    // boss ← {m1..m4}：第二層四人並排 → 分區須橫向涵蓋整排。
    const data = makeOrgData({
      employees: [emp('boss'), emp('m1'), emp('m2'), emp('m3'), emp('m4')],
      groups: [group('g1')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
        ...['m1', 'm2', 'm3', 'm4'].map((e) =>
          assignment(`a-${e}`, {
            employeeId: e,
            groupId: 'g1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
          }),
        ),
      ],
    });
    const r = buildGroupOrgGraph(data, 'g1');
    expectZoneContainsMembers(r.nodes, 'g1');
  });

  it('ALL 視角多組：每一分區皆完全包住自己的成員', () => {
    // parent←child 階層 + function 並排：跨組攤平 + 全圖 X 吸附後仍逐組包容。
    const data = makeOrgData({
      employees: [
        emp('p'),
        emp('pc'),
        emp('c'),
        emp('cc'),
        emp('fa'),
        emp('fb'),
      ],
      groups: [
        group('parent', { kind: 'department' }),
        group('child', { kind: 'department', parentId: 'parent' }),
        group('fn', { kind: 'function', parentId: null }),
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
        assignment('a-fa', { employeeId: 'fa', groupId: 'fn' }),
        assignment('a-fb', {
          employeeId: 'fb',
          groupId: 'fn',
          supervisorIds: ['fa'],
          primarySupervisorId: 'fa',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    for (const gid of ['parent', 'child', 'fn']) {
      expectZoneContainsMembers(r.nodes, gid);
    }
  });

  /**
   * 窄分區 + 去重疊往右推（修法主要破口）：
   * `left` 組第二層 fan-out 五人佔滿低 X 多欄；`narrow` 組（每層單人）在同一層帶
   * （y）與 left 的子層相撞 → 去重疊 cursor 把 `narrow` 成員一路右推到遠離其原 cluster
   * 的 X。zone 須依「推後實際座標」回推 → 右緣仍包住被右推的成員（舊邏輯用推前
   * cluster 尺寸會在此溢出右緣）。
   */
  function narrowPushedRightOrg() {
    return makeOrgData({
      employees: [
        emp('lboss'),
        emp('l1'),
        emp('l2'),
        emp('l3'),
        emp('l4'),
        emp('l5'),
        emp('nboss'),
        emp('n1'),
      ],
      groups: [
        group('left', { kind: 'function', parentId: null }),
        group('narrow', { kind: 'function', parentId: null }),
      ],
      assignments: [
        assignment('a-lboss', { employeeId: 'lboss', groupId: 'left' }),
        ...['l1', 'l2', 'l3', 'l4', 'l5'].map((e) =>
          assignment(`a-${e}`, {
            employeeId: e,
            groupId: 'left',
            supervisorIds: ['lboss'],
            primarySupervisorId: 'lboss',
          }),
        ),
        assignment('a-nboss', { employeeId: 'nboss', groupId: 'narrow' }),
        assignment('a-n1', {
          employeeId: 'n1',
          groupId: 'narrow',
          supervisorIds: ['nboss'],
          primarySupervisorId: 'nboss',
        }),
      ],
    });
  }

  it('窄分區成員被同層去重疊往右推 → 推後仍不溢出分區右緣', () => {
    const r = buildGroupOrgGraph(narrowPushedRightOrg(), ALL_GROUPS_VIEW_ID);
    // 兩組成員皆須各自被包住（含被右推的 narrow）。
    expectZoneContainsMembers(r.nodes, 'left');
    expectZoneContainsMembers(r.nodes, 'narrow');
  });

  it('窄分區情境確有「往右推」發生（否則此守護無鑑別力）', () => {
    // 鑑別力前提：narrow 的第二層成員（n1）與 left 第二層 fan-out 同一 Y 帶，
    // 且其 X 被推到 left 整排 fan-out 的右側（≥ left 該帶最大 X + 一欄寬）。
    const r = buildGroupOrgGraph(narrowPushedRightOrg(), ALL_GROUPS_VIEW_ID);
    const n1 = memberNode(r.nodes, 'n1', 'narrow')!;
    const leftSecondLayer = ['l1', 'l2', 'l3', 'l4', 'l5'].map(
      (e) => memberNode(r.nodes, e, 'left')!,
    );
    // n1 與 left 第二層在同一層帶（同 Y）。
    for (const m of leftSecondLayer) {
      expect(m.position.y).toBe(n1.position.y);
    }
    const leftMaxX = Math.max(...leftSecondLayer.map((m) => m.position.x));
    // n1 被推到整排 left fan-out 右側（嚴格大於 left 最大 X，差距 ≥ 一欄寬）。
    expect(n1.position.x).toBeGreaterThan(leftMaxX);
    expect(n1.position.x - leftMaxX).toBeGreaterThanOrEqual(COLUMN_WIDTH);
    // 而 zone 仍包住它（與上一測試同源，但此處顯式點出右緣不溢出）。
    const zone = zoneOf(r.nodes, 'narrow')!;
    const zoneRight = zone.position.x + (zone.style!.width as number);
    expect(n1.position.x + ORG_FLOW_NODE_WIDTH).toBeLessThanOrEqual(zoneRight);
  });

  it('窄分區夾在兩寬分區之間（左右皆右推壓力）→ 仍完全包住', () => {
    // left/right 皆寬（第二層各三人）、mid 窄（每層單人）夾中間。
    const mk = (
      prefix: string,
      group_: string,
      children: string[],
    ): ReturnType<typeof assignment>[] => [
      assignment(`a-${prefix}boss`, {
        employeeId: `${prefix}boss`,
        groupId: group_,
      }),
      ...children.map((e) =>
        assignment(`a-${e}`, {
          employeeId: e,
          groupId: group_,
          supervisorIds: [`${prefix}boss`],
          primarySupervisorId: `${prefix}boss`,
        }),
      ),
    ];
    const data = makeOrgData({
      employees: [
        emp('lboss'),
        emp('l1'),
        emp('l2'),
        emp('l3'),
        emp('mboss'),
        emp('m1'),
        emp('rboss'),
        emp('r1'),
        emp('r2'),
        emp('r3'),
      ],
      groups: [
        group('left', { kind: 'function', parentId: null }),
        group('mid', { kind: 'function', parentId: null }),
        group('right', { kind: 'function', parentId: null }),
      ],
      assignments: [
        ...mk('l', 'left', ['l1', 'l2', 'l3']),
        ...mk('m', 'mid', ['m1']),
        ...mk('r', 'right', ['r1', 'r2', 'r3']),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    for (const gid of ['left', 'mid', 'right']) {
      expectZoneContainsMembers(r.nodes, gid);
    }
  });

  it('co-leader 納入分區後（多一節點）→ 分區仍包住含 co-leader 的全員', () => {
    // sales leaderId=CEO（不在 sales）；s3/s4 主管 COO（exec 組長）→ COO 納入 sales。
    const sales = group('sales', { leaderId: 'CEO' });
    const data = makeOrgData({
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
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    // sales 分區須包住含被納入的 co-leader（COO）在內的全部 5 個節點。
    expect(membersOf(r.nodes, 'sales')).toHaveLength(5);
    expectZoneContainsMembers(r.nodes, 'sales');
    expectZoneContainsMembers(r.nodes, 'exec');
  });

  it('空組（無成員）→ 分區仍有可見下限尺寸（width/height > 0）', () => {
    const data = makeOrgData({ groups: [group('empty')] });
    const r = buildGroupOrgGraph(data, 'empty');
    const zone = zoneOf(r.nodes, 'empty')!;
    expect(membersOf(r.nodes, 'empty')).toHaveLength(0);
    // 空組用 cluster 位置 + 組內佈局下限尺寸（= ZONE_PADDING*2，不為 0 → 仍可見）。
    // 註：空組不保證 ≥ 一個節點寬高（無成員可回推），只要求 > 0 維持可見即可。
    expect(zone.data.width).toBeGreaterThan(0);
    expect(zone.data.height).toBeGreaterThan(0);
  });

  it('ALL 視角混合（含空組與非空組）→ 各分區皆包住自己成員、空組維持下限尺寸', () => {
    const data = makeOrgData({
      employees: [emp('boss'), emp('sub')],
      groups: [group('full'), group('empty')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss', groupId: 'full' }),
        assignment('a-sub', {
          employeeId: 'sub',
          groupId: 'full',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
        }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    expectZoneContainsMembers(r.nodes, 'full');
    const emptyZone = zoneOf(r.nodes, 'empty')!;
    expect(membersOf(r.nodes, 'empty')).toHaveLength(0);
    expect(emptyZone.data.width).toBeGreaterThan(0);
    expect(emptyZone.data.height).toBeGreaterThan(0);
  });

  it('非空分區 data.width===style.width、zIndex===0、成員 zIndex===1、hue 依 idx', () => {
    // ZONE_HUES = [212,152,28,...]：第一組 idx0→212、第二組 idx1→152。
    const data = makeOrgData({
      employees: [emp('a0'), emp('b0')],
      groups: [group('z0'), group('z1')],
      assignments: [
        assignment('a-a0', { employeeId: 'a0', groupId: 'z0' }),
        assignment('a-b0', { employeeId: 'b0', groupId: 'z1' }),
      ],
    });
    const r = buildGroupOrgGraph(data, ALL_GROUPS_VIEW_ID);
    const z0 = zoneOf(r.nodes, 'z0')!;
    const z1 = zoneOf(r.nodes, 'z1')!;
    // data 尺寸與 style 尺寸同源一致。
    expect(z0.data.width).toBe(z0.style!.width);
    expect(z0.data.height).toBe(z0.style!.height);
    expect(z1.data.width).toBe(z1.style!.width);
    expect(z1.data.height).toBe(z1.style!.height);
    // 分區為背景（zIndex 0）、成員疊上（zIndex 1）。
    expect(z0.zIndex).toBe(0);
    expect(z1.zIndex).toBe(0);
    for (const m of [...membersOf(r.nodes, 'z0'), ...membersOf(r.nodes, 'z1')]) {
      expect(m.zIndex).toBe(1);
    }
    // hue 依 layouts 索引取 ZONE_HUES（第一組 212、第二組 152）。
    expect(z0.data.hue).toBe(212);
    expect(z1.data.hue).toBe(152);
  });
});
