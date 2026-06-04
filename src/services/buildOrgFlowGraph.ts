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

const NODE_WIDTH = 220;
const NODE_HEIGHT = 88;

export interface OrgFlowGraphResult {
  nodes: Node<EmployeeNodeData>[];
  edges: Edge[];
  error?: string;
}

function layoutWithDagre(
  nodes: Node<EmployeeNodeData>[],
  edges: Edge[],
): Node<EmployeeNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 72 });

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
        jobLevelName: jobLevel?.name ?? '—',
        isPrimaryGroup: assignment.isPrimaryGroup,
        groupName: isAllGroups
          ? (displayGroup?.name ?? '全公司')
          : group!.name,
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
  return { nodes: laidOut, edges };
}
