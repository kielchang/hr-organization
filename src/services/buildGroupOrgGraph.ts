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
  ORG_FLOW_NODE_SEP,
  ORG_FLOW_NODE_WIDTH,
  layoutReportingSubgraph,
} from './buildOrgFlowGraph';
import {
  deriveAllGroupLeadership,
  type GroupLeadership,
} from './groupLeadership';
import { computePrimaryDepth } from './reportingDepth';
import { detectReportingCycleFromAssignments } from './validators';

export { ALL_GROUPS_VIEW_ID } from './buildOrgFlowGraph';

/** 分區背景四周留白（成員 cluster 外緣到分區色塊邊界的距離）。 */
const ZONE_PADDING = 28;
/** 分區頂部額外留白：容納角落「組名・組長」小標籤，避免壓到第一層成員。 */
const ZONE_LABEL_HEIGHT = 36;
/** 組層級 dagre 的 cluster 間距（rank 方向＝垂直、node 方向＝水平）。 */
const GROUP_RANK_SEP = 120;
const GROUP_NODE_SEP = 120;

/**
 * X 欄位網格欄寬：與匯報視圖同源（NODE_WIDTH + NODE_SEP）。
 * 全圖共用同一組欄位刻度，使跨組／跨層成員 X 對齊、匯報線不被不相關節點遮擋。
 */
const COLUMN_WIDTH = ORG_FLOW_NODE_WIDTH + ORG_FLOW_NODE_SEP;

/**
 * 分區背景色相環（subtle 淡色填充）：各組依索引取一個 hue，呈泳道感而非實心框。
 * 渲染端（GroupZoneNode）以 `--zone-hue` 套 `hsl()` 低彩度淡色背景＋淡邊。
 */
const ZONE_HUES = [212, 152, 28, 280, 340, 188, 96, 256];

/**
 * 群組分區背景節點的 data（供 GroupZoneNode 渲染，D2 元件）。
 *
 * 取代舊 `GroupBoxNodeData`：**移除 levelLines**（不再有框內層級輔助線）、
 * 保留組別識別／領導／尺寸；新增 `hue`（分區淡色色相）。分區為**背景、低層、
 * 不互動**——非容器框，成員為攤平的頂層節點疊在分區之上。
 */
export interface GroupZoneNodeData extends Record<string, unknown> {
  groupId: string;
  groupName: string;
  /** 組別種類（department 走階層 parentId、function 扁平並排）。 */
  kind: Group['kind'];
  /** 組長（employeeId）；推導或手動指定，可 null。 */
  leaderId: string | null;
  /** 推導式平行共管（co-leader）employeeId 陣列。 */
  coLeaderIds: string[];
  /** 分區色塊尺寸（佈局算出＝成員 cluster 範圍 + padding）。 */
  width: number;
  height: number;
  /** 分區淡色色相（HSL hue，0–360）；每組不同、subtle。 */
  hue: number;
}

export interface GroupOrgGraphResult {
  /** groupZone 背景節點（先、低 zIndex）+ 攤平的 employee 頂層節點（後、高 zIndex）。 */
  nodes: Node[];
  /** 成員間匯報邊（含跨組）；不再有 group:parent→group:child 框錨點邊。 */
  edges: Edge[];
  error?: string;
  /** 各組推導出的領導結構（leader + co-leaders）。 */
  leadership: Map<string, GroupLeadership>;
}

function groupZoneId(groupId: string): string {
  return `group:${groupId}`;
}

/**
 * 成員節點 id 作用域化：同一員工可隸屬多組（且 co-leader 被納入共管組），
 * ALL 視角下若用裸 employeeId 會在多分區產生相同 id（React key 衝突）。
 * 以 `${groupId}::${employeeId}` 作用域化避免重撞。
 * 原始 employeeId 仍保留在 `node.data.employee.id`，供 D2 選取／diff 還原。
 */
function memberNodeId(groupId: string, employeeId: string): string {
  return `${groupId}::${employeeId}`;
}

/**
 * X 欄位網格吸附：把節點 X 吸附到最近的欄位刻度（全圖共用同一組刻度，原點 0、
 * 欄寬 {@link COLUMN_WIDTH}），使跨組／跨層節點 X 對齊、整體工整（bootstrap-like）。
 * **無可見格線**——僅量化座標。Y 維持層帶不動。
 *
 * 純函式、不可變：回傳吸附後的 X（呼叫端負責後續同層去重疊）。
 */
export function snapXToGrid(x: number): number {
  return Math.round(x / COLUMN_WIDTH) * COLUMN_WIDTH;
}

/** 單組組內佈局的中間結果（座標相對 cluster 左上，含頂部標籤留白位移）。 */
interface IntraGroupLayout {
  group: Group;
  leadership: GroupLeadership;
  /** 已定位的成員節點（座標相對 cluster 左上、含頂部標籤+padding 位移）。 */
  memberNodes: Node<EmployeeNodeData>[];
  /** 組內成員間的匯報邊（端點為作用域化 id）。 */
  edges: Edge[];
  /** cluster 範圍（含 padding）：分區背景色塊的寬高。 */
  width: number;
  height: number;
}

/**
 * 為單一組別建構「組內子佈局」：成員節點 + 組內匯報邊，重用
 * `layoutReportingSubgraph`（dagre + 層帶 + 父置中），回傳定位後成員與 cluster 尺寸。
 *
 * 與舊版差異：**不再產出層級輔助線**；座標相對 cluster 左上（扣 bounds.minX、扣最小
 * Y，再加頂部標籤留白 + padding），但**仍是 cluster 內相對座標**——呼叫端再加上該
 * cluster 的絕對位移，得到攤平後的絕對座標（成員為頂層節點、無 parentId）。
 *
 * 層級規則（使用者定案：層級骨架依「組別管理」，各組頂點＝組長 leaderId）：
 * - 根集合 = {leaderId} ∪ {co-leaders} → 皆 level 1（頂，co-lead 與組長平行同層共管）。
 * - 其餘成員：由根集合沿「組內 primary 主管 → 部屬」往下 BFS，逐層 +1。
 * - 無法從根集合到達者（鏈不指向根、或主管在組外且非 co-lead）→ level 1（斷開/待確認）。
 * - leaderId 為 null 時 fallback：以 `computePrimaryDepth`（組內匯報根 = 1）置頂，維持可用。
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

  // co-leader（組外主管）也納入本組作為節點，與組長並排同層共管。
  const coLeaderIds = leadership.coLeaderIds.filter((id) => !memberIds.has(id));
  const displayEmployeeIds = [...memberIds, ...coLeaderIds];
  const coLeaderSet = new Set(leadership.coLeaderIds);

  // 層級骨架以「組長（leaderId）置頂」：組內層級＝以組長為根的 top-down 深度（BFS）。
  // 根集合 = {leaderId} ∪ {co-leaders}（co-lead 與組長平行同層）→ 皆 level 1（頂）；
  // 其餘成員：沿「組內 primary 主管 → 部屬」邊由根往下逐層 +1。
  //
  // 無法從根集合到達的成員（組內無 primary 主管指向根的鏈、或其主管在組外且非 co-lead）
  // → 放 level 1（與組長並排，視為斷開／待確認；由 orgHealth 警示標記）。
  //
  // leaderId 為 null 時 fallback：以既有「組內匯報根」相對深度置頂（維持可用），
  // 與 deriveInGroupRoot 同源（computePrimaryDepth：組內匯報根 = 1）。
  const LEADER_LEVEL = 1;
  const levelMap = new Map<string, number>();

  if (leadership.leaderId == null) {
    // fallback：無組長 → 組內匯報根置頂（既有行為）。co-leader 仍鉗到頂層同層共管。
    const fallbackDepth = computePrimaryDepth(groupAssignments);
    for (const eid of displayEmployeeIds) {
      levelMap.set(
        eid,
        coLeaderSet.has(eid) ? LEADER_LEVEL : fallbackDepth.get(eid) ?? LEADER_LEVEL,
      );
    }
  } else {
    // 由「組內 primary 主管」建子樹鄰接表（主管 → 部屬），只含顯示集合內的邊。
    const childrenBySup = new Map<string, string[]>();
    for (const eid of memberIds) {
      const sup = memberAssignmentByEmployee.get(eid)?.primarySupervisorId ?? null;
      if (sup == null) continue;
      if (!memberIds.has(sup) && !coLeaderSet.has(sup)) continue; // 主管在組外且非 co-lead → 不連
      const arr = childrenBySup.get(sup);
      if (arr) arr.push(eid);
      else childrenBySup.set(sup, [eid]);
    }

    // 從根集合（組長 + co-leaders）BFS 往下，逐層 +1；防環以「已定 level」判定。
    const queue: string[] = [];
    const rootSet = new Set<string>(coLeaderSet);
    rootSet.add(leadership.leaderId);
    for (const root of rootSet) {
      if (!levelMap.has(root)) {
        levelMap.set(root, LEADER_LEVEL);
        queue.push(root);
      }
    }
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const lv = levelMap.get(cur)!;
      for (const child of childrenBySup.get(cur) ?? []) {
        if (levelMap.has(child)) continue; // 已定（含防環、含 co-lead 子也被組長並排）
        levelMap.set(child, lv + 1);
        queue.push(child);
      }
    }

    // 未被 BFS 觸及者（斷開/待確認）→ level 1，與組長並排。
    for (const eid of displayEmployeeIds) {
      if (!levelMap.has(eid)) levelMap.set(eid, LEADER_LEVEL);
    }
  }

  const nodes: Node<EmployeeNodeData>[] = displayEmployeeIds.map((eid) => {
    const employee = data.employees.find((e) => e.id === eid)!;
    const assignment = memberAssignmentByEmployee.get(eid);
    const jobLevel = assignment
      ? data.jobLevels.find((j) => j.id === assignment.jobLevelId)
      : undefined;
    return {
      // 作用域化 id（避免多分區同員工重撞）；employee.id 仍是裸 employeeId。
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
  // 故 levelMap 也改用作用域化 key。
  const scopedLevelMap = new Map<string, number>();
  for (const [eid, lv] of levelMap) {
    scopedLevelMap.set(memberNodeId(group.id, eid), lv);
  }

  const { nodes: laidOut, bounds } = layoutReportingSubgraph(
    nodes,
    edges,
    scopedLevelMap,
  );

  // layoutReportingSubgraph 的 X 已正規化到 bounds.minX 起算；Y 為 level×LEVEL_GAP。
  // 平移到 cluster 內相對座標：扣 bounds.minX + padding（左）、扣最小 Y + 頂部標籤留白
  // + padding（上）。呼叫端再加 cluster 絕對位移即得攤平後絕對座標。
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
    // 攤平：成員為頂層節點，移除 parentId/extent。座標為 cluster 內相對座標。
    position: {
      x: n.position.x - bounds.minX + ZONE_PADDING,
      y: n.position.y - minY + ZONE_LABEL_HEIGHT + ZONE_PADDING,
    },
  }));

  const width = innerWidth + ZONE_PADDING * 2;
  const height = maxRelY + ZONE_LABEL_HEIGHT + ZONE_PADDING * 2;

  return { group, leadership, memberNodes, edges, width, height };
}

/**
 * 用 `Group.parentId`（department 樹）對各組 cluster 跑一次 dagre（rankdir TB），
 * 得各 cluster 絕對左上座標。cluster 尺寸＝組內佈局算出的 width/height。
 *
 * - department 組以 parentId 連邊參與 rank 排序（父組在上、子組在下）。
 * - function 組 parentId 為 null → 無入邊，dagre 視為各自的根、自然並排。
 *
 * 註：此處只決定各 cluster 的「群聚相對位置」，讓同組成員相鄰、父組在上子組在下；
 * 跨組上下關係由攤平後的成員匯報線自然呈現，不再需要框錨點邊。
 */
function positionClusters(
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
    g.setNode(groupZoneId(l.group.id), {
      width: l.width,
      height: l.height,
    });
  }
  for (const l of layouts) {
    const parentId = l.group.parentId;
    // 僅當父 cluster 也在本次顯示集合內才連邊（避免指向未顯示祖先造成孤點被誤排）。
    if (parentId != null && present.has(parentId)) {
      g.setEdge(groupZoneId(parentId), groupZoneId(l.group.id));
    }
  }

  dagre.layout(g);

  const result = new Map<string, { x: number; y: number }>();
  for (const l of layouts) {
    const pos = g.node(groupZoneId(l.group.id));
    result.set(l.group.id, {
      x: pos.x - l.width / 2,
      y: pos.y - l.height / 2,
    });
  }
  return result;
}

/**
 * 組別為主佈局（重設計）：一張連貫的組織圖 + 同組背景分區。
 *
 * - 成員為**攤平的頂層 `employee` 節點**（無 parentId、絕對座標＝cluster 位移 + 組內
 *   相對座標）；同組成員相鄰、匯報線（含跨組）自然呈現。
 * - 每組一個**背景分區節點** `groupZone`（淡色色塊 + 角落標籤，低 zIndex、不互動），
 *   覆蓋該組 cluster 範圍，呈泳道感而非容器框。
 * - **X 欄位網格吸附**：攤平取得絕對座標後，對所有成員 X 吸附到全圖共用欄位刻度
 *   （`snapXToGrid`），使跨組/跨層對齊、整體工整；吸附後同層去重疊。**無可見格線**。
 * - co-leader 鉗到組長層呈現平行同層共管；組內佈局重用 `layoutReportingSubgraph`。
 *
 * - `groupId === ALL_GROUPS_VIEW_ID`：顯示全部 active 組；否則僅該單一組。
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

  // 各組組內佈局（座標為 cluster 內相對座標）。
  const layouts = targetGroups.map((g) =>
    layoutIntraGroup(data, g, leadership.get(g.id)!, diffMap),
  );

  // 各 cluster 整體定位（組層級 dagre），得 cluster 絕對左上座標。
  const clusterPositions = positionClusters(layouts);

  // 攤平的成員節點（後輸出、高 zIndex）：cluster 位移 + 組內相對座標 → 絕對座標。
  const memberNodes: Node<EmployeeNodeData>[] = [];
  // 各組攤平後的成員節點對照（供下方「依吸附後實際 bounding box 回推分區尺寸」）。
  const membersByGroup = new Map<string, Node<EmployeeNodeData>[]>();

  layouts.forEach((layout) => {
    const pos = clusterPositions.get(layout.group.id) ?? { x: 0, y: 0 };
    const groupMembers: Node<EmployeeNodeData>[] = [];

    for (const n of layout.memberNodes) {
      const placed: Node<EmployeeNodeData> = {
        ...n,
        // 攤平：絕對座標 = cluster 位移 + cluster 內相對座標。
        position: {
          x: pos.x + n.position.x,
          y: pos.y + n.position.y,
        },
        // 成員疊在分區之上。
        zIndex: 1,
      };
      memberNodes.push(placed);
      groupMembers.push(placed);
    }
    membersByGroup.set(layout.group.id, groupMembers);
  });

  // X 欄位網格吸附（全圖共用刻度）：攤平取得絕對座標後量化 X，使跨組/跨層對齊。
  // Y 維持層帶。吸附後同層（同 Y）可能相撞 → 依 X 排序保證最小水平間距、保留相對順序。
  for (const n of memberNodes) {
    n.position = { ...n.position, x: snapXToGrid(n.position.x) };
  }
  const byBand = new Map<number, Node<EmployeeNodeData>[]>();
  for (const n of memberNodes) {
    const arr = byBand.get(n.position.y) ?? [];
    arr.push(n);
    byBand.set(n.position.y, arr);
  }
  for (const arr of byBand.values()) {
    arr.sort((a, b) => a.position.x - b.position.x);
    let cursor = -Infinity;
    for (const n of arr) {
      if (n.position.x < cursor) {
        n.position = { ...n.position, x: cursor };
      }
      cursor = n.position.x + COLUMN_WIDTH;
    }
  }

  // 背景分區節點（先輸出、低 zIndex）：尺寸／位置依「吸附+去重疊後成員實際 bounding
  // box」回推，確保框住所有被位移的成員（窄分區成員往右推也不溢出）。
  // 空組（無成員）→ 沿用組內佈局算出的 cluster 位置與下限尺寸維持可見。
  const zoneNodes: Node<GroupZoneNodeData>[] = layouts.map((layout, idx) => {
    const lead = layout.leadership;
    const hue = ZONE_HUES[idx % ZONE_HUES.length];
    const members = membersByGroup.get(layout.group.id) ?? [];

    let position: { x: number; y: number };
    let width: number;
    let height: number;
    if (members.length > 0) {
      const minX = Math.min(...members.map((n) => n.position.x));
      const maxX = Math.max(
        ...members.map((n) => n.position.x + ORG_FLOW_NODE_WIDTH),
      );
      const minY = Math.min(...members.map((n) => n.position.y));
      const maxY = Math.max(
        ...members.map((n) => n.position.y + ORG_FLOW_NODE_HEIGHT),
      );
      position = {
        x: minX - ZONE_PADDING,
        y: minY - ZONE_LABEL_HEIGHT - ZONE_PADDING,
      };
      width = maxX - minX + ZONE_PADDING * 2;
      height = maxY - minY + ZONE_LABEL_HEIGHT + ZONE_PADDING * 2;
    } else {
      // 空組：無成員可回推 → 用 cluster 位置 + 組內佈局下限尺寸（ZONE_PADDING/
      // ZONE_LABEL_HEIGHT 已內含於 layout.width/height）。
      position = clusterPositions.get(layout.group.id) ?? { x: 0, y: 0 };
      width = layout.width;
      height = layout.height;
    }

    return {
      id: groupZoneId(layout.group.id),
      type: 'groupZone',
      position,
      // 分區為背景：低 zIndex、style 套尺寸、全面不互動。
      style: { width, height },
      zIndex: 0,
      selectable: false,
      draggable: false,
      connectable: false,
      deletable: false,
      data: {
        groupId: layout.group.id,
        groupName: layout.group.name,
        kind: layout.group.kind,
        leaderId: lead.leaderId,
        coLeaderIds: lead.coLeaderIds,
        width,
        height,
        hue,
      },
    };
  });

  // groupZone（背景、先）+ employee（攤平、後）：父先順序不再是 RF 需求（無 parentId），
  // 但維持「背景先、成員後」的輸出順序與 zIndex，確保成員疊在分區之上。
  const nodes: Node[] = [...zoneNodes, ...memberNodes];

  // 組內成員匯報邊（各組 layoutIntraGroup 算出、type='reporting'、端點為作用域化 id）：
  // 併入頂層回傳；edge id 已含 `go-${group.id}-` 前綴 → 全域唯一。
  // 不再產生 group:parent→group:child 框錨點邊（部門上下關係靠 cluster 位置 + 跨組匯報線）。
  const edges: Edge[] = [];
  for (const layout of layouts) {
    edges.push(...layout.edges);
  }

  // 組間連線改「組長鏈」（取代舊 go-cross 任意跨組成員匯報邊）：
  // 層級骨架依「組別管理」——組的上下關係＝Group.parentId、各組頂點＝Group.leaderId。
  // 故組間關係以「子組組長 → 父組組長」一條邊呈現（child leader → parent leader），
  // 端點為兩組各自 leaderId 對應的攤平 employee 節點 id（作用域化 ${groupId}::${leaderId}）。
  //
  // 邊界：子組或父組 leaderId 為 null、或對應 leader 節點不在圖中 → 跳過該組長鏈（不畫）。
  // 邊型：沿用 reporting edge（實線 + 箭頭），但以中性 label「組別階層」與 id 前綴
  // go-leaderlink- 與組內主匯報區隔；co-lead 平行共管仍由 A 段（同層）與 Phase F 維持。
  const displayNodeIds = new Set(memberNodes.map((n) => n.id));
  let leaderLinkIndex = 0;
  for (const g of targetGroups) {
    const parentId = g.parentId;
    if (parentId == null || !targetGroupIds.has(parentId)) continue; // 父組須在顯示集合內
    const childLeaderId = leadership.get(g.id)?.leaderId ?? null;
    const parentLeaderId = leadership.get(parentId)?.leaderId ?? null;
    if (childLeaderId == null || parentLeaderId == null) continue; // 任一無組長 → 跳過

    const childNode = memberNodeId(g.id, childLeaderId);
    const parentNode = memberNodeId(parentId, parentLeaderId);
    // leader 節點存在性確認：對應的成員節點須在圖中（leader 必為其組成員，理論恆真，仍防呆）。
    if (!displayNodeIds.has(childNode) || !displayNodeIds.has(parentNode)) continue;
    if (childNode === parentNode) continue; // 同節點（理論不會發生）→ 不畫自環。

    edges.push({
      id: `go-leaderlink-${leaderLinkIndex++}`,
      source: parentNode,
      target: childNode,
      type: 'reporting',
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      data: {
        // 實線 + 箭頭（isPrimary）；label 用「組別階層」與組內「主匯報」區隔語意。
        isPrimary: true,
        label: '組別階層',
        offset: GROUP_RANK_SEP / 2,
      } satisfies ReportingEdgeData,
    });
  }

  return { nodes, edges, leadership };
}
