import dagre from '@dagrejs/dagre';
import {
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { EmployeeNodeData } from '../components/orgFlow/EmployeeNode';
import type { ReportingEdgeData } from '../components/orgFlow/ReportingEdge';
import type { Assignment, Group, OrgData } from '../types/org';
import type { NodeDiffStatus } from '../types/editSession';
import {
  ALL_GROUPS_VIEW_ID,
  ORG_FLOW_NODE_HEIGHT,
  layoutReportingSubgraph,
} from './buildOrgFlowGraph';
import {
  deriveAllGroupLeadership,
  type GroupLeadership,
} from './groupLeadership';
import { computePrimaryDepth } from './reportingDepth';
import { detectReportingCycleFromAssignments } from './validators';

export { ALL_GROUPS_VIEW_ID } from './buildOrgFlowGraph';

/** 群組框內邊距（成員子佈局相對框左上的位移基準）。 */
const BOX_PADDING = 24;
/** 群組框標題列高度（顯示組名/組長/co-lead 徽章）。 */
const BOX_TITLE_HEIGHT = 56;
/** 群組框尺寸的下限（避免空組或單人組過窄／過扁）。 */
const MIN_BOX_WIDTH = 248;
const MIN_BOX_HEIGHT = BOX_TITLE_HEIGHT + BOX_PADDING * 2 + 40;
/** 組層級 dagre 的框間距（rank 方向＝垂直、node 方向＝水平）。 */
const GROUP_RANK_SEP = 96;
const GROUP_NODE_SEP = 96;

/** 群組框父節點的 data（供 GroupBoxNode 顯示，D2 元件）。 */
export interface GroupBoxNodeData extends Record<string, unknown> {
  groupId: string;
  groupName: string;
  /** 組別種類（department 走階層 parentId、function 扁平並排）。 */
  kind: Group['kind'];
  /** 組長（employeeId）；推導或手動指定，可 null。 */
  leaderId: string | null;
  /** 推導式平行共管（co-leader）employeeId 陣列。 */
  coLeaderIds: string[];
  /** 框尺寸（佈局算出；供元件決定外框大小）。 */
  width: number;
  height: number;
  /**
   * 組內層級輔助線（框內相對座標）：沿用匯報視圖層帶概念但相對「各組框」。
   * `y` 為框內相對 Y（與成員子節點同一套位移：扣 minY + 標題列 + 內距），
   * `label` 為「第N層」（組內相對、組長層起算）。純佈局資料、不含姓名。
   */
  levelLines: { level: number; y: number; label: string }[];
}

export interface GroupOrgGraphResult {
  /** groupBox 父節點 + employee 子節點（子節點帶 parentId/extent）。 */
  nodes: Node[];
  /** 組間關聯邊（department 樹 parentId：group:parent → group:child）。 */
  edges: Edge[];
  error?: string;
  /** 各組推導出的領導結構（leader + co-leaders）。 */
  leadership: Map<string, GroupLeadership>;
}

function groupBoxId(groupId: string): string {
  return `group:${groupId}`;
}

/**
 * 成員子節點 id 作用域化：同一員工可隸屬多組（且 co-leader 被納入共管組框），
 * ALL 視角下若用裸 employeeId 會在多框產生相同 id（React key 衝突 + RF v12
 * parentId/extent 解析錯亂）。以 `${groupId}::${employeeId}` 作用域化避免重撞。
 * 原始 employeeId 仍保留在 `node.data.employee.id`，供 D2 選取/diff 還原。
 */
function memberNodeId(groupId: string, employeeId: string): string {
  return `${groupId}::${employeeId}`;
}

/** 單組組內佈局的中間結果。 */
interface IntraGroupLayout {
  group: Group;
  leadership: GroupLeadership;
  /** 已定位的成員節點（座標相對框左上、含標題列+內距位移）。 */
  memberNodes: Node<EmployeeNodeData>[];
  /** 組內成員間的匯報邊（主管也在本組者）。 */
  edges: Edge[];
  /** 組內層級輔助線（框內相對 Y，與成員節點同一套位移）。 */
  levelLines: { level: number; y: number; label: string }[];
  width: number;
  height: number;
}

/**
 * 為單一組別建構「組內子佈局」：成員節點 + 組內匯報邊 + 組內相對層級，
 * 重用 `layoutReportingSubgraph`（dagre + 層帶 + 父置中），回傳定位後成員與框尺寸。
 *
 * 層級規則：
 * - 用 `computePrimaryDepth(該組 assignments)` 得「組內相對深度」（組內匯報根 = 1）。
 * - **組長層 = 最小**：以組長的組內深度為基準層；組長若非組內根，整體仍依各自深度，
 *   但 co-leader 鉗到組長層（見下）以呈現「平行同層共管」。
 * - **co-leader 同層**：把每位 co-leader 的 level 鉗到 leader 的 level（與組長同 Y）。
 *   co-leader 是「組外主管」（不在成員集合），會額外作為成員節點納入本組框、
 *   與組長並排同層。
 */
function layoutIntraGroup(
  data: OrgData,
  group: Group,
  leadership: GroupLeadership,
  diffMap?: Map<string, NodeDiffStatus>,
): IntraGroupLayout {
  const groupAssignments = data.assignments.filter(
    (a) => a.groupId === group.id,
  );
  const memberAssignmentByEmployee = new Map<string, Assignment>();
  for (const a of groupAssignments) {
    if (!memberAssignmentByEmployee.has(a.employeeId)) {
      memberAssignmentByEmployee.set(a.employeeId, a);
    }
  }
  const memberIds = new Set(memberAssignmentByEmployee.keys());

  // co-leader（組外主管）也納入本組框作為節點，與組長並排同層共管。
  const coLeaderIds = leadership.coLeaderIds.filter((id) => !memberIds.has(id));
  const displayEmployeeIds = [...memberIds, ...coLeaderIds];
  const coLeaderSet = new Set(leadership.coLeaderIds);

  // 組內相對深度（組內匯報根 = 1，只走 primarySupervisorId）。
  const depthMap = computePrimaryDepth(groupAssignments);
  const leaderLevel =
    leadership.leaderId != null
      ? depthMap.get(leadership.leaderId) ?? 1
      : 1;

  // 每節點「組內有效層級」（組長層 = 最小、leaderLevel 起算）：
  // - 組長 / co-leader → leaderLevel（co-leader 與組長平行同層共管）。
  // - 一般成員 → 沿組內主匯報鏈往上走：
  //     · 到 co-leader（組外主管被納入框）→ co-leader 層(leaderLevel) + 往下步數，
  //       使 co-leader 的部屬落在其「下一層」、非與組長同層。
  //     · 到組長或其他組內根/組外非 co-leader 主管 → 以組內深度（leaderLevel 起算）。
  // 走鏈記憶化、含環防護（理論上已被 detectReportingCycle 擋掉）。
  const levelMap = new Map<string, number>();
  const visiting = new Set<string>();
  const resolveLevel = (eid: string): number => {
    const cached = levelMap.get(eid);
    if (cached != null) return cached;
    if (coLeaderSet.has(eid)) {
      levelMap.set(eid, leaderLevel);
      return leaderLevel;
    }
    if (visiting.has(eid)) return leaderLevel; // 防環
    visiting.add(eid);

    const sup = memberAssignmentByEmployee.get(eid)?.primarySupervisorId ?? null;
    let lv: number;
    if (sup != null && coLeaderSet.has(sup)) {
      // 主管是顯示中的 co-leader → 落在 co-leader 下一層。
      lv = resolveLevel(sup) + 1;
    } else if (sup != null && memberIds.has(sup)) {
      // 主管在組內 → 主管層 + 1（沿鏈遞迴；co-leader 子樹也由此自然下推）。
      lv = resolveLevel(sup) + 1;
    } else {
      // 組內根（主管為 null、或主管為組外非 co-leader）→ 以組內深度落 leaderLevel 起算。
      lv = leaderLevel - 1 + (depthMap.get(eid) ?? 1);
    }

    visiting.delete(eid);
    levelMap.set(eid, lv);
    return lv;
  };
  for (const eid of displayEmployeeIds) resolveLevel(eid);

  const nodes: Node<EmployeeNodeData>[] = displayEmployeeIds.map((eid) => {
    const employee = data.employees.find((e) => e.id === eid)!;
    const assignment = memberAssignmentByEmployee.get(eid);
    const jobLevel = assignment
      ? data.jobLevels.find((j) => j.id === assignment.jobLevelId)
      : undefined;
    return {
      // 作用域化 id（避免多框同員工重撞）；employee.id 仍是裸 employeeId。
      id: memberNodeId(group.id, eid),
      type: 'employee',
      position: { x: 0, y: 0 },
      data: {
        employee,
        // co-leader 無本組 assignment：以空字串標示（D2 端不可拖改其組）。
        assignmentId: assignment?.id ?? '',
        jobLevelName: jobLevel?.name ?? '—',
        isPrimaryGroup: assignment?.isPrimaryGroup ?? false,
        groupName: group.name,
        level: levelMap.get(eid),
        diffStatus: diffMap?.get(eid),
      },
    };
  });

  // 組內邊：成員 supervisorIds 中「主管也在本組顯示節點集合」者（含 co-leader）。
  const displaySet = new Set(displayEmployeeIds);
  const edgePrimary = new Map<string, boolean>();
  for (const a of groupAssignments) {
    for (const supId of a.supervisorIds) {
      if (!displaySet.has(supId)) continue;
      const key = `${supId}\0${a.employeeId}`;
      const isPrimary = a.primarySupervisorId === supId;
      edgePrimary.set(key, edgePrimary.get(key) || isPrimary);
    }
  }
  const edges: Edge[] = [];
  let edgeIndex = 0;
  for (const [key, isPrimary] of edgePrimary) {
    const [supEid, empEid] = key.split('\0');
    edges.push({
      id: `go-${group.id}-e-${edgeIndex++}`,
      // 端點用作用域化 id，與成員節點 id 一致（layoutReportingSubgraph 以 id 配對）。
      source: memberNodeId(group.id, supEid),
      target: memberNodeId(group.id, empEid),
      type: 'reporting',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: {
        isPrimary,
        label: isPrimary ? '主匯報' : '虛線匯報',
        offset: GROUP_RANK_SEP / 2,
      } satisfies ReportingEdgeData,
    });
  }

  // layoutReportingSubgraph 以 node id 配對 nodes/edges/levelMap；node id 已作用域化，
  // 故 levelMap 也改用作用域化 key（原 levelMap 以裸 eid keying，仍供 node.data.level）。
  const scopedLevelMap = new Map<string, number>();
  for (const [eid, lv] of levelMap) {
    scopedLevelMap.set(memberNodeId(group.id, eid), lv);
  }

  const { nodes: laidOut, levels, bounds } = layoutReportingSubgraph(
    nodes,
    edges,
    scopedLevelMap,
  );

  // layoutReportingSubgraph 的 X 已正規化到 bounds.minX 起算；Y 為 level×LEVEL_GAP
  // （含 leaderLevel 起算的偏移）。平移到框內：扣 bounds.minX、扣最小 Y，再加標題列+內距。
  const minY =
    laidOut.length > 0
      ? Math.min(...laidOut.map((n) => n.position.y))
      : 0;
  const innerWidth = Math.max(0, bounds.maxX - bounds.minX);
  const maxRelY =
    laidOut.length > 0
      ? Math.max(
          ...laidOut.map((n) => n.position.y - minY + ORG_FLOW_NODE_HEIGHT),
        )
      : 0;

  const memberNodes: Node<EmployeeNodeData>[] = laidOut.map((n) => ({
    ...n,
    parentId: groupBoxId(group.id),
    extent: 'parent',
    position: {
      x: n.position.x - bounds.minX + BOX_PADDING,
      y: n.position.y - minY + BOX_TITLE_HEIGHT + BOX_PADDING,
    },
  }));

  // 組內層級輔助線：把 layoutReportingSubgraph 回傳的層帶中心 y（lv.y，= 該層
  // 節點 topY + NODE_HEIGHT/2）轉成框內相對座標，與成員節點用同一套位移
  // （扣 minY、加標題列+內距），使輔助線正好穿過該層成員中心。
  const levelLines = levels.map((lv) => ({
    level: lv.level,
    y: lv.y - minY + BOX_TITLE_HEIGHT + BOX_PADDING,
    label: lv.label,
  }));

  const width = Math.max(MIN_BOX_WIDTH, innerWidth + BOX_PADDING * 2);
  const height = Math.max(
    MIN_BOX_HEIGHT,
    maxRelY + BOX_TITLE_HEIGHT + BOX_PADDING * 2,
  );

  return { group, leadership, memberNodes, edges, levelLines, width, height };
}

/**
 * 用 `Group.parentId`（department 樹）對群組框跑一次 dagre（rankdir TB），
 * 得各框絕對左上座標。框尺寸＝組內佈局算出的 width/height。
 *
 * - department 組以 parentId 連邊參與 rank 排序。
 * - function 組 parentId 為 null → 無入邊，dagre 視為各自的根、自然並排在 department
 *   樹旁（沿用 membership 水平堆砌概念）。
 */
function positionBoxes(
  layouts: IntraGroupLayout[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: GROUP_NODE_SEP,
    ranksep: GROUP_RANK_SEP,
  });

  const present = new Set(layouts.map((l) => l.group.id));
  for (const l of layouts) {
    g.setNode(groupBoxId(l.group.id), {
      width: l.width,
      height: l.height,
    });
  }
  for (const l of layouts) {
    const parentId = l.group.parentId;
    // 僅當父框也在本次顯示集合內才連邊（避免指向未顯示的祖先造成孤點被誤排）。
    if (parentId != null && present.has(parentId)) {
      g.setEdge(groupBoxId(parentId), groupBoxId(l.group.id));
    }
  }

  dagre.layout(g);

  const result = new Map<string, { x: number; y: number }>();
  for (const l of layouts) {
    const pos = g.node(groupBoxId(l.group.id));
    result.set(l.group.id, {
      x: pos.x - l.width / 2,
      y: pos.y - l.height / 2,
    });
  }
  return result;
}

/**
 * 組別為主佈局：每個顯示的 active 組 → 一個 `groupBox` 父節點，組成員（含推導
 * co-leader）→ `employee` 子節點（`parentId` 指向框、`extent:'parent'`、座標相對框）。
 *
 * - `groupId === ALL_GROUPS_VIEW_ID`：顯示全部 active 組；否則僅該單一組。
 * - 組內佈局重用 `layoutReportingSubgraph`；co-leader 鉗到組長層呈現平行同層共管。
 * - 組間關聯邊用 `Group.parentId`（department 樹）；function 組扁平、並排。
 * - 群組框整體定位以框為節點跑一次組層級 dagre；成員子節點座標為相對框、由
 *   React Flow `parentId` 處理平移、不需再手動加框絕對座標。
 *
 * 防呆：找不到組／空資料 → `{ nodes: [], edges: [], error, leadership: new Map() }`。
 * 重用既有循環防護（detectReportingCycleFromAssignments）。
 */
export function buildGroupOrgGraph(
  data: OrgData,
  groupId: string,
  diffMap?: Map<string, NodeDiffStatus>,
): GroupOrgGraphResult {
  const isAllGroups = groupId === ALL_GROUPS_VIEW_ID;

  const targetGroups = isAllGroups
    ? data.groups.filter((g) => g.status === 'active')
    : data.groups.filter((g) => g.id === groupId && g.status === 'active');

  if (!isAllGroups) {
    const exists = data.groups.some((g) => g.id === groupId);
    if (!exists) {
      return { nodes: [], edges: [], error: '找不到組別', leadership: new Map() };
    }
    if (targetGroups.length === 0) {
      // 組存在但已停用：以空畫面呈現（非錯誤）。
      return { nodes: [], edges: [], leadership: new Map() };
    }
  }

  if (targetGroups.length === 0) {
    return { nodes: [], edges: [], leadership: new Map() };
  }

  // 循環防護：對顯示集合的所有 assignment 偵測匯報循環（重用既有純函式）。
  const targetGroupIds = new Set(targetGroups.map((g) => g.id));
  const scopedAssignments = data.assignments.filter((a) =>
    targetGroupIds.has(a.groupId),
  );
  const cycleErrors = detectReportingCycleFromAssignments(scopedAssignments);
  if (cycleErrors.length > 0) {
    return {
      nodes: [],
      edges: [],
      error: cycleErrors.join('；'),
      leadership: new Map(),
    };
  }

  // 領導結構（leader + co-leader）：對全資料推導，再取顯示組的部分。
  const allLeadership = deriveAllGroupLeadership(data);
  const leadership = new Map<string, GroupLeadership>();
  for (const g of targetGroups) {
    leadership.set(
      g.id,
      allLeadership.get(g.id) ?? {
        groupId: g.id,
        leaderId: null,
        coLeaderIds: [],
      },
    );
  }

  // 各組組內佈局。
  const layouts = targetGroups.map((g) =>
    layoutIntraGroup(data, g, leadership.get(g.id)!, diffMap),
  );

  // 群組框整體定位（組層級 dagre）。
  const boxPositions = positionBoxes(layouts);

  const nodes: Node[] = [];
  for (const layout of layouts) {
    const pos = boxPositions.get(layout.group.id) ?? { x: 0, y: 0 };
    const lead = layout.leadership;
    const boxNode: Node<GroupBoxNodeData> = {
      id: groupBoxId(layout.group.id),
      type: 'groupBox',
      position: pos,
      // 框尺寸由 React Flow 用 style 套用；元件可另讀 data.width/height。
      style: { width: layout.width, height: layout.height },
      data: {
        groupId: layout.group.id,
        groupName: layout.group.name,
        kind: layout.group.kind,
        leaderId: lead.leaderId,
        coLeaderIds: lead.coLeaderIds,
        width: layout.width,
        height: layout.height,
        levelLines: layout.levelLines,
      },
    };
    nodes.push(boxNode);
    // 成員子節點（座標已相對框；React Flow parentId 會處理絕對平移）。
    nodes.push(...layout.memberNodes);
  }

  // 組內匯報邊（各組 layoutIntraGroup 算出、type='reporting'、端點為作用域化 id）：
  // 併入頂層回傳；edge id 已含 `go-${group.id}-` 前綴 → 全域唯一。
  const edges: Edge[] = [];
  for (const layout of layouts) {
    edges.push(...layout.edges);
  }

  // 組間關聯邊（department 樹 parentId）：父子框皆在顯示集合內才連。
  let edgeIndex = 0;
  for (const g of targetGroups) {
    const parentId = g.parentId;
    if (parentId != null && targetGroupIds.has(parentId)) {
      edges.push({
        id: `go-link-${edgeIndex++}`,
        source: groupBoxId(parentId),
        target: groupBoxId(g.id),
        type: 'default',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          // 中性色箭頭，與組內 reporting 邊（白底標籤）視覺區隔。
          color: 'var(--muted-foreground)',
        },
        // 部門階層線：實線、稍粗、中性色，明確標示「組間上下層關係」。
        style: { stroke: 'var(--muted-foreground)', strokeWidth: 2 },
      });
    }
  }

  return { nodes, edges, leadership };
}
