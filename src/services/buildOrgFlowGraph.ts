import dagre from '@dagrejs/dagre';
import {
  MarkerType,
  Position,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { EmployeeNodeData } from '../components/orgFlow/EmployeeNode';
import type { ReportingEdgeData } from '../components/orgFlow/ReportingEdge';
import type { Assignment, OrgData } from '../types/org';
import type { NodeDiffStatus } from '../types/editSession';
import { computePrimaryDepth, effectiveLevel } from './reportingDepth';
import {
  detectReportingCycle,
  detectReportingCycleFromAssignments,
} from './validators';

export const ALL_GROUPS_VIEW_ID = '__all__';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 112;
/** 員工節點寬高（供組別視圖等重用者推算框尺寸；與本檔 dagre 用值同源）。 */
export const ORG_FLOW_NODE_WIDTH = NODE_WIDTH;
export const ORG_FLOW_NODE_HEIGHT = NODE_HEIGHT;
/** 加大層距，讓跨層匯報線的水平段落在層與層之間、不穿過節點 */
const RANK_SEP = 120;
const NODE_SEP = 60;
/** 節點水平間距（供組別視圖 X 欄位吸附推算欄寬：NODE_WIDTH + NODE_SEP）。 */
export const ORG_FLOW_NODE_SEP = NODE_SEP;
/** 每層的垂直間距；亦為拖曳吸附的網格大小 */
const LEVEL_GAP = NODE_HEIGHT + RANK_SEP;
export const ORG_FLOW_LEVEL_GAP = LEVEL_GAP;
/** 由節點 top Y 反推層級值（拖曳改層級用） */
export function levelFromTopY(topY: number): number {
  return Math.round(topY / LEVEL_GAP);
}

export interface OrgFlowLevelLine {
  /** 組織層級值（1-indexed） */
  level: number;
  /** 該層節點的 top Y（拖曳吸附基準） */
  topY: number;
  /** 階層線在畫布座標的 Y（穿過該層節點中心） */
  y: number;
  label: string;
}

export interface OrgFlowGraphResult {
  nodes: Node<EmployeeNodeData>[];
  edges: Edge[];
  error?: string;
  /** 各匯報層的水平階層線 */
  levels?: OrgFlowLevelLine[];
  /** 節點水平範圍（用於畫線寬度與標籤位置） */
  bounds?: { minX: number; maxX: number };
}

/**
 * 決定每個節點的「有效層級」（effective level）。
 *
 * 單一真實來源 = **主匯報深度**（`computePrimaryDepth`，根 = 第 1 層、每階 +1，
 * 只走 `primarySupervisorId`、忽略虛線）。`assignment.level` 退為稀疏的「手動覆寫」，
 * 由 `effectiveLevel` 套用（覆寫優先、否則用計算深度）。
 *
 * 此 map 同時供 (a) 帶 dummy 的主排版決定跨層邊的 dagre span，以及 (b) 後續
 * level band 覆寫 Y——三者用同一份層級，dagre rank 因此自然對齊 level，
 * 跨層邊的水平段才會落在層間空隙、不穿中間層節點。
 */
function resolveLevels(
  nodes: Node<EmployeeNodeData>[],
  displayByNode: Map<string, Assignment>,
  depthMap: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const n of nodes) {
    const display = displayByNode.get(n.id);
    result.set(n.id, display ? effectiveLevel(display, depthMap) : 1);
  }
  return result;
}

/**
 * 用 Dagre 計算節點水平排序（X）。
 *
 * 核心 (a)：對「跨層邊」（target 與 source 的有效層級差 > 1）插入 dummy 中繼
 * 節點鏈（source → d1 → d2 → … → target，每個中間層一個），讓 Dagre：
 *   1. 把每條真實邊拆成「每段恰跨 1 個 rank」，使所有真實節點的 dagre rank
 *      對齊其有效層級；
 *   2. 在中間層為跨層邊保留水平通道（dummy 佔位，真實節點自動避讓）。
 *
 * dummy **只進 Dagre 影響排版**；回傳的節點只含真實節點（取其 dagre X），
 * 不外洩任何 dummy。
 */
function layoutWithDagre(
  nodes: Node<EmployeeNodeData>[],
  edges: Edge[],
  levelOf: Map<string, number>,
): Node<EmployeeNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  let dummySeq = 0;
  edges.forEach((edge) => {
    const sLv = levelOf.get(edge.source);
    const tLv = levelOf.get(edge.target);
    // 缺層級或非「下行」邊（同層/上行/反向）：照原樣連，不插 dummy。
    if (sLv == null || tLv == null || tLv - sLv <= 1) {
      g.setEdge(edge.source, edge.target);
      return;
    }
    // 跨層邊：插入 (tLv - sLv - 1) 個 dummy，串成每段跨 1 rank 的鏈。
    let prev = edge.source;
    for (let lv = sLv + 1; lv < tLv; lv++) {
      const dummyId = `__dummy__${dummySeq++}`;
      g.setNode(dummyId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      g.setEdge(prev, dummyId);
      prev = dummyId;
    }
    g.setEdge(prev, edge.target);
  });

  dagre.layout(g);

  // 只取真實節點；dummy 僅用於影響 Dagre 排 X，不外洩到輸出。
  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });
}

/**
 * (b) 父置中於直接子女（org chart 慣例）：父節點 X = 其直接部屬 X 範圍中心。
 *
 * - 只看「主匯報」邊（避免多主管時把父往多處拉），以每個 target 的主管為樹邊。
 * - 由「葉往根」(層級由大到小) 處理，確保子女位置先底定、父再對齊其子女中心，
 *   多層樹也能逐層收斂置中。
 * - dummy 不參與（這裡只用真實節點與真實邊）。同層去重疊在 applyLevelBands 收尾。
 */
function centerParents(
  laidOut: Node<EmployeeNodeData>[],
  edges: Edge[],
  levelOf: Map<string, number>,
): Node<EmployeeNodeData>[] {
  const byId = new Map(laidOut.map((n) => [n.id, n]));
  // 父 → 直接子女（僅主匯報邊，且雙端皆為真實節點）。
  const children = new Map<string, string[]>();
  for (const e of edges) {
    // 以結構旗標判主匯報邊（不依賴 UI 顯示字串 label，避免改文案/i18n 後失效）。
    if (e.data?.isPrimary !== true) continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const arr = children.get(e.source) ?? [];
    arr.push(e.target);
    children.set(e.source, arr);
  }
  if (children.size === 0) return laidOut;

  // 葉往根：父的有效層級由大到小處理，使父對齊「已底定」的子女中心。
  const parents = [...children.keys()].sort(
    (a, b) => (levelOf.get(b) ?? 0) - (levelOf.get(a) ?? 0),
  );
  const x = new Map(laidOut.map((n) => [n.id, n.position.x]));
  for (const pid of parents) {
    const kids = children.get(pid)!;
    // 奇偶中位數父置中：升冪排序子女 X，奇數對齊中位子節點、偶數取中間兩子中點。
    // 比 (min+max)/2 更貼齊「主幹」子女，避免單一離群子女把父往邊緣拉。
    const kidXs = kids.map((k) => x.get(k)!).sort((a, b) => a - b);
    const n = kidXs.length;
    const centerX =
      n % 2 === 1 ? kidXs[(n - 1) / 2] : (kidXs[n / 2 - 1] + kidXs[n / 2]) / 2;
    x.set(pid, centerX);
  }

  return laidOut.map((n) => ({ ...n, position: { ...n.position, x: x.get(n.id)! } }));
}

/**
 * 以「有效層級」決定垂直層帶：dagre 只負責水平排序（X），Y 一律對齊各層 band。
 *
 * 有效層級由 `resolveLevels` 預先算出（主匯報深度為預設、assignment.level 為覆寫），
 * 與主排版插 dummy 時用的層級為同一份——確保 dagre rank、跨層通道與 band Y 三者一致。
 */
function applyLevelBands(
  laidOut: Node<EmployeeNodeData>[],
  levelMap: Map<string, number>,
): {
  nodes: Node<EmployeeNodeData>[];
  levels: OrgFlowLevelLine[];
  bounds: { minX: number; maxX: number };
} {
  if (laidOut.length === 0) {
    return { nodes: laidOut, levels: [], bounds: { minX: 0, maxX: 0 } };
  }

  const levelOf = (n: Node<EmployeeNodeData>): number => levelMap.get(n.id) ?? 1;

  // 層級值 → 絕對 Y（topY = level × 層高），讓拖曳可超出現有範圍新增層
  const usedLevels = [...new Set(laidOut.map(levelOf))].sort((a, b) => a - b);
  const topYOf = (lv: number) => lv * LEVEL_GAP;

  const nodes = laidOut.map((n) => {
    const lv = levelOf(n);
    const topY = topYOf(lv);
    return {
      ...n,
      position: { x: n.position.x, y: topY },
      data: { ...n.data, level: lv, levelTopY: topY },
    };
  });

  // 同層去重疊：band 收合（如全公司）後同 Y 的節點 X 可能相撞，
  // 依 X 排序後保證最小水平間距（保留相對順序）。
  const byBand = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const arr = byBand.get(n.position.y) ?? [];
    arr.push(n);
    byBand.set(n.position.y, arr);
  }
  for (const arr of byBand.values()) {
    arr.sort((a, b) => a.position.x - b.position.x);
    let cursor = -Infinity;
    for (const n of arr) {
      if (n.position.x < cursor) n.position.x = cursor;
      cursor = n.position.x + NODE_WIDTH + NODE_SEP;
    }
  }

  const xs = nodes.map((n) => n.position.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs.map((x) => x + NODE_WIDTH));

  // 層級輔助線 = 真實層級樹：從該組最高層（min level）連續填滿到最低層（max level），
  // 中間若有跨層空缺（無節點的層）也保留空白輔助線；標籤用實際 level 值，
  // 不再重新編號，讓單組檢視能反映該組在公司整體中的真實層級位置。
  const minLevel = usedLevels[0];
  const maxLevel = usedLevels[usedLevels.length - 1];
  const levels: OrgFlowLevelLine[] = [];
  for (let lv = minLevel; lv <= maxLevel; lv++) {
    levels.push({
      level: lv,
      topY: topYOf(lv),
      y: topYOf(lv) + NODE_HEIGHT / 2,
      label: `第 ${lv} 層`,
    });
  }

  return { nodes, levels, bounds: { minX, maxX } };
}

function pickDisplayAssignment(
  assignments: Assignment[],
  employeeId: string,
): Assignment | undefined {
  const mine = assignments.filter((a) => a.employeeId === employeeId);
  return mine.find((a) => a.isPrimaryGroup) ?? mine[0];
}

/** `layoutReportingSubgraph` 的輸出：定位後節點 + 層帶輔助線 + 水平範圍。 */
export interface ReportingSubgraphLayout {
  nodes: Node<EmployeeNodeData>[];
  levels: OrgFlowLevelLine[];
  bounds: { minX: number; maxX: number };
}

/**
 * 可重入的「匯報子圖」三段佈局管線：`layoutWithDagre → centerParents → applyLevelBands`。
 *
 * 吃**已建好**的真實節點（`EmployeeNodeData`）、匯報邊（`data.isPrimary` 標主匯報）
 * 與 `levelMap`（每節點的有效層級，1-indexed、最小層在上），回傳定位後節點、
 * 各層水平輔助線與 X 範圍。常數（NODE_WIDTH/HEIGHT、RANK_SEP、NODE_SEP、LEVEL_GAP）
 * 與旗標語意全部沿用，故 `buildOrgFlowGraph`（reporting）行為等價。
 *
 * 給 `buildGroupOrgGraph` 重用做「組內子佈局」：座標為相對於子圖原點（左上約 0,0
 * 起算的 dagre 排版），呼叫端可平移進群組框、或讀 `bounds`/層帶高度推算框尺寸。
 */
export function layoutReportingSubgraph(
  nodes: Node<EmployeeNodeData>[],
  edges: Edge[],
  levelMap: Map<string, number>,
): ReportingSubgraphLayout {
  const laidOut = layoutWithDagre(nodes, edges, levelMap);
  const centered = centerParents(laidOut, edges, levelMap);
  return applyLevelBands(centered, levelMap);
}

export function buildOrgFlowGraph(
  data: OrgData,
  groupId: string,
  diffMap?: Map<string, NodeDiffStatus>,
): OrgFlowGraphResult {
  const isAllGroups = groupId === ALL_GROUPS_VIEW_ID;
  const activeGroupIds = new Set(
    data.groups.filter((g) => g.status === 'active').map((g) => g.id),
  );

  if (!isAllGroups) {
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) {
      return { nodes: [], edges: [], error: '找不到組別' };
    }
  }

  const groupAssignments = isAllGroups
    ? data.assignments.filter((a) => activeGroupIds.has(a.groupId))
    : data.assignments.filter((a) => a.groupId === groupId);

  const cycleErrors = isAllGroups
    ? detectReportingCycleFromAssignments(groupAssignments)
    : detectReportingCycle(groupId, data.assignments);
  if (cycleErrors.length > 0) {
    return {
      nodes: [],
      edges: [],
      error: cycleErrors.join('；'),
    };
  }

  const group = isAllGroups
    ? null
    : data.groups.find((g) => g.id === groupId)!;
  const employeeIds = new Set(groupAssignments.map((a) => a.employeeId));

  // 每個節點（= employeeId）的顯示歸屬，供層級計算（effectiveLevel）共用。
  const displayByNode = new Map<string, Assignment>();

  const nodes: Node<EmployeeNodeData>[] = [...employeeIds].map((eid) => {
    const employee = data.employees.find((e) => e.id === eid)!;
    const assignment = pickDisplayAssignment(groupAssignments, eid)!;
    displayByNode.set(eid, assignment);
    const jobLevel = data.jobLevels.find((j) => j.id === assignment.jobLevelId);
    const displayGroup = data.groups.find((g) => g.id === assignment.groupId);
    return {
      id: eid,
      type: 'employee',
      position: { x: 0, y: 0 },
      data: {
        employee,
        assignmentId: assignment.id,
        jobLevelName: jobLevel?.name ?? '—',
        isPrimaryGroup: assignment.isPrimaryGroup,
        groupName: isAllGroups
          ? (displayGroup?.name ?? '全公司')
          : group!.name,
        level: assignment.level,
        diffStatus: diffMap?.get(eid),
      },
    };
  });

  const edgePrimary = new Map<string, boolean>();
  for (const a of groupAssignments) {
    for (const supId of a.supervisorIds) {
      if (!employeeIds.has(supId)) continue;
      const key = `${supId}\0${a.employeeId}`;
      const isPrimary = a.primarySupervisorId === supId;
      edgePrimary.set(key, edgePrimary.get(key) || isPrimary);
    }
  }

  const edges: Edge[] = [];
  let edgeIndex = 0;
  for (const [key, isPrimary] of edgePrimary) {
    const [source, target] = key.split('\0');
    const edge: Edge = {
      id: `e-${edgeIndex++}`,
      source,
      target,
      // 自訂 edge：透明底標籤浮在線上、線連續不被內建 label 白底切斷。
      type: 'reporting',
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
      },
      // 控制流（父→子女主匯報樹）以結構欄位 isPrimary 承載，不耦合 UI 顯示字串；
      // centerParents 仍依賴 data.isPrimary。label 僅供畫面顯示，改文案/i18n 不影響
      // 父置中邏輯。offset 沿用原 smoothstep pathOptions（水平段下沉到層間空隙中央，
      // borderRadius 固定 12，由 ReportingEdge 取用）。
      data: {
        isPrimary,
        label: isPrimary ? '主匯報' : '虛線匯報',
        offset: RANK_SEP / 2,
      } satisfies ReportingEdgeData,
    };
    edges.push(edge);
  }

  // (a) 先定每個節點的有效層級：主匯報深度為預設、assignment.level 為覆寫。
  //     供帶 dummy 的主排版與 level band 共用 → dagre rank 對齊 level，跨層邊留水平通道。
  const depthMap = computePrimaryDepth(groupAssignments);
  const levelMap = resolveLevels(nodes, displayByNode, depthMap);
  // (b) 父置中於直接（主匯報）子女 →（c）層帶覆寫 Y + 同層去重疊。
  // 三段管線抽為 layoutReportingSubgraph，與組別視圖共用同一演算法（避免分岔）。
  const { nodes: leveled, levels, bounds } = layoutReportingSubgraph(
    nodes,
    edges,
    levelMap,
  );
  return { nodes: leveled, edges, levels, bounds };
}
