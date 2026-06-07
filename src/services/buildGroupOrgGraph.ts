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
 * 層級規則（沿用）：
 * - 用 `computePrimaryDepth(該組 assignments)` 得「組內相對深度」（組內匯報根 = 1）。
 * - co-leader（組外主管）納入本組作為節點、鉗到組長層，呈現平行同層共管。
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

  // 組內相對深度（組內匯報根 = 1，只走 primarySupervisorId）。
  const depthMap = computePrimaryDepth(groupAssignments);
  const leaderLevel =
    leadership.leaderId != null
      ? depthMap.get(leadership.leaderId) ?? 1
      : 1;

  // 每節點「組內有效層級」（組長層 = 最小、leaderLevel 起算）：
  // - 組長 / co-leader → leaderLevel（co-leader 與組長平行同層共管）。
  // - 一般成員 → 沿組內主匯報鏈往上走：
  //     · 到 co-leader（組外主管被納入）→ co-leader 層(leaderLevel) + 往下步數。
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

  // 跨組匯報邊：成員的主管在「別組」（非本組顯示集合、亦非已納入本組的 co-leader）時，
  // 組內佈局不會產生該邊。為呈現「一張連貫的組織圖」（如 李小華→王大明 跨分區），
  // 在頂層補上端點落在不同 cluster 的匯報線，讓部門上下關係靠分區位置 + 跨區線自然呈現。
  //
  // 每位顯示中員工解析出唯一「主節點」（其主歸屬 cluster 的作用域化 id；多組時優先
  // isPrimaryGroup、否則首次出現），跨組邊以此為端點，避免同員工多分區造成連線分歧。
  const primaryNodeOf = new Map<string, string>();
  for (const g of targetGroups) {
    const ga = data.assignments.filter((a) => a.groupId === g.id);
    for (const a of ga) {
      const existing = primaryNodeOf.get(a.employeeId);
      // 優先綁定主歸屬組的節點；無主歸屬時保留首見。
      if (existing == null || a.isPrimaryGroup) {
        primaryNodeOf.set(a.employeeId, memberNodeId(g.id, a.employeeId));
      }
    }
  }
  // 已由組內邊覆蓋的 (source 員工, target 員工) 配對：避免跨組邊與組內邊重複呈現。
  const sameGroupPairs = new Set<string>();
  for (const layout of layouts) {
    const ga = data.assignments.filter((a) => a.groupId === layout.group.id);
    const memberSet = new Set(ga.map((a) => a.employeeId));
    const coLeadSet = new Set(layout.leadership.coLeaderIds);
    for (const a of ga) {
      for (const supId of a.supervisorIds) {
        if (memberSet.has(supId) || coLeadSet.has(supId)) {
          sameGroupPairs.add(`${supId}\0${a.employeeId}`);
        }
      }
    }
  }
  const crossPrimary = new Map<string, boolean>();
  for (const a of scopedAssignments) {
    for (const supId of a.supervisorIds) {
      const pairKey = `${supId}\0${a.employeeId}`;
      if (sameGroupPairs.has(pairKey)) continue; // 已由組內邊呈現。
      const srcNode = primaryNodeOf.get(supId);
      const tgtNode = primaryNodeOf.get(a.employeeId);
      // 主管須為顯示中的員工（有主節點）；端點分屬不同 cluster 才算跨組。
      if (srcNode == null || tgtNode == null || srcNode === tgtNode) continue;
      const isPrimary = a.primarySupervisorId === supId;
      crossPrimary.set(pairKey, (crossPrimary.get(pairKey) ?? false) || isPrimary);
    }
  }
  let crossIndex = 0;
  for (const [pairKey, isPrimary] of crossPrimary) {
    const [supId, empId] = pairKey.split('\0');
    edges.push({
      id: `go-cross-${crossIndex++}`,
      source: primaryNodeOf.get(supId)!,
      target: primaryNodeOf.get(empId)!,
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

  return { nodes, edges, leadership };
}
