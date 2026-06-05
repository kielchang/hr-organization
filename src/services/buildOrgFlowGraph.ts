import dagre from '@dagrejs/dagre';
import {
  MarkerType,
  Position,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { EmployeeNodeData } from '../components/orgFlow/EmployeeNode';
import type { Assignment, OrgData } from '../types/org';
import {
  detectReportingCycle,
  detectReportingCycleFromAssignments,
} from './validators';

export const ALL_GROUPS_VIEW_ID = '__all__';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 112;
/** 加大層距，讓跨層匯報線的水平段落在層與層之間、不穿過節點 */
const RANK_SEP = 120;
const NODE_SEP = 60;
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

function layoutWithDagre(
  nodes: Node<EmployeeNodeData>[],
  edges: Edge[],
): Node<EmployeeNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

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
 * 以 assignment 的 `level` 決定垂直層帶：dagre 只負責水平排序（X），
 * Y 一律對齊各層 band。缺 level 的節點以 dagre 垂直排序為後備。
 */
function applyLevelBands(laidOut: Node<EmployeeNodeData>[]): {
  nodes: Node<EmployeeNodeData>[];
  levels: OrgFlowLevelLine[];
  bounds: { minX: number; maxX: number };
} {
  if (laidOut.length === 0) {
    return { nodes: laidOut, levels: [], bounds: { minX: 0, maxX: 0 } };
  }

  // dagre 垂直排序 → 後備層級（缺 level 時用）
  const dagreYs = [...new Set(laidOut.map((n) => Math.round(n.position.y)))].sort(
    (a, b) => a - b,
  );
  const dagreRank = new Map(dagreYs.map((y, i) => [y, i + 1]));

  const levelOf = (n: Node<EmployeeNodeData>): number => {
    const lv = n.data.level;
    if (typeof lv === 'number' && lv >= 1) return lv;
    return dagreRank.get(Math.round(n.position.y)) ?? 1;
  };

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

  // 標籤用「位置序」：最上面（最小 level）永遠是第 1 層，
  // 頂部插一層時，下面各層的層號自動 +1。
  const levels: OrgFlowLevelLine[] = usedLevels.map((lv, i) => ({
    level: lv,
    topY: topYOf(lv),
    y: topYOf(lv) + NODE_HEIGHT / 2,
    label: `第 ${i + 1} 層`,
  }));

  return { nodes, levels, bounds: { minX, maxX } };
}

function pickDisplayAssignment(
  assignments: Assignment[],
  employeeId: string,
): Assignment | undefined {
  const mine = assignments.filter((a) => a.employeeId === employeeId);
  return mine.find((a) => a.isPrimaryGroup) ?? mine[0];
}

export function buildOrgFlowGraph(
  data: OrgData,
  groupId: string,
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

  const nodes: Node<EmployeeNodeData>[] = [...employeeIds].map((eid) => {
    const employee = data.employees.find((e) => e.id === eid)!;
    const assignment = pickDisplayAssignment(groupAssignments, eid)!;
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
    edges.push({
      id: `e-${edgeIndex++}`,
      source,
      target,
      type: 'smoothstep',
      animated: false,
      style: isPrimary
        ? { strokeWidth: 2 }
        : { strokeWidth: 1.5, strokeDasharray: '6 4' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
      },
      label: isPrimary ? '主匯報' : '虛線匯報',
      labelStyle: { fontSize: 10 },
    });
  }

  const laidOut = layoutWithDagre(nodes, edges);
  const { nodes: leveled, levels, bounds } = applyLevelBands(laidOut);
  return { nodes: leveled, edges, levels, bounds };
}
