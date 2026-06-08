import dagre from '@dagrejs/dagre';
import {
  MarkerType,
  Position,
  type Edge,
  type Node,
} from '@xyflow/react';
import type { AssignmentMemberNodeData } from '../components/groupMembership/AssignmentMemberNode';
import type { ExternalSupervisorNodeData } from '../components/groupMembership/ExternalSupervisorNode';
import type { GroupLabelNodeData } from '../components/groupMembership/GroupLabelNode';
import type { Assignment, GroupKind, OrgData } from '../types/org';
import { detectReportingCycle } from './validators';

export const ALL_GROUPS_VIEW_ID = '__all__';

const MEMBER_WIDTH = 200;
const MEMBER_HEIGHT = 96;
const EXTERNAL_WIDTH = 188;
const EXTERNAL_HEIGHT = 72;
const CLUSTER_GAP = 64;
const GROUP_LABEL_HEIGHT = 36;
const CLUSTER_PADDING = 24;

export interface GroupMembershipGraphResult {
  nodes: Node[];
  edges: Edge[];
  error?: string;
}

function layoutCluster(
  nodes: Node[],
  edges: Edge[],
  nodeSize: (id: string) => { width: number; height: number },
): { nodes: Node[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 64 });

  nodes.forEach((node) => {
    const size = nodeSize(node.id);
    g.setNode(node.id, size);
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  let maxX = 0;
  let maxY = 0;
  const laidOut = nodes.map((node) => {
    const pos = g.node(node.id);
    const size = nodeSize(node.id);
    const x = pos.x - size.width / 2;
    const y = pos.y - size.height / 2;
    maxX = Math.max(maxX, x + size.width);
    maxY = Math.max(maxY, y + size.height);
    return {
      ...node,
      position: { x, y },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    };
  });

  return { nodes: laidOut, width: maxX, height: maxY };
}

function supervisorContext(
  data: OrgData,
  supervisorId: string,
): { name: string; groupName: string; jobLevelName: string } {
  const employee = data.employees.find((e) => e.id === supervisorId);
  const assignments = data.assignments.filter((a) => a.employeeId === supervisorId);
  const primary =
    assignments.find((a) => a.isPrimaryGroup) ?? assignments[0];
  const group = primary
    ? data.groups.find((g) => g.id === primary.groupId)
    : undefined;
  const jobLevel = primary
    ? data.jobLevels.find((j) => j.id === primary.jobLevelId)
    : undefined;
  return {
    name: employee?.name ?? supervisorId,
    groupName: group?.name ?? '—',
    jobLevelName: jobLevel?.name ?? '—',
  };
}

function externalNodeId(groupId: string, supervisorId: string): string {
  return `ext:${groupId}:${supervisorId}`;
}

function assignmentNodeId(assignmentId: string): string {
  return `asn:${assignmentId}`;
}

function groupLabelNodeId(groupId: string): string {
  return `gl:${groupId}`;
}

function nodeDimensions(id: string): { width: number; height: number } {
  if (id.startsWith('ext:')) {
    return { width: EXTERNAL_WIDTH, height: EXTERNAL_HEIGHT };
  }
  return { width: MEMBER_WIDTH, height: MEMBER_HEIGHT };
}

function buildEdgesForAssignments(
  data: OrgData,
  assignments: Assignment[],
  employeeIdsInGroup: Set<string>,
  groupId: string,
  edgeStartIndex: number,
): { edges: Edge[]; externalNodes: Node<ExternalSupervisorNodeData>[]; nextIndex: number } {
  const edges: Edge[] = [];
  const externalById = new Map<string, Node<ExternalSupervisorNodeData>>();
  let edgeIndex = edgeStartIndex;

  const edgePrimary = new Map<string, boolean>();
  for (const a of assignments) {
    for (const supId of a.supervisorIds) {
      const supAssignment = assignments.find((x) => x.employeeId === supId);
      const source = supAssignment
        ? assignmentNodeId(supAssignment.id)
        : externalNodeId(groupId, supId);
      const target = assignmentNodeId(a.id);
      const key = `${source}\0${target}`;
      const isPrimary = a.primarySupervisorId === supId;
      edgePrimary.set(key, edgePrimary.get(key) || isPrimary);
    }
  }

  for (const [key, isPrimary] of edgePrimary) {
    const [source, target] = key.split('\0');
    edges.push({
      id: `gm-e-${edgeIndex++}`,
      source,
      target,
      type: 'smoothstep',
      style: isPrimary
        ? { strokeWidth: 2 }
        : { strokeWidth: 1.5, strokeDasharray: '6 4' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
      },
      label: isPrimary ? '主主管' : '其他主管',
      labelStyle: { fontSize: 10 },
    });
  }

  for (const a of assignments) {
    for (const supId of a.supervisorIds) {
      if (employeeIdsInGroup.has(supId)) continue;
      const nid = externalNodeId(groupId, supId);
      if (externalById.has(nid)) continue;
      const ctx = supervisorContext(data, supId);
      externalById.set(nid, {
        id: nid,
        type: 'externalSupervisor',
        position: { x: 0, y: 0 },
        data: {
          employeeId: supId,
          name: ctx.name,
          groupName: ctx.groupName,
          jobLevelName: ctx.jobLevelName,
        },
      });
    }
  }

  return {
    edges,
    externalNodes: [...externalById.values()],
    nextIndex: edgeIndex,
  };
}

function buildCluster(
  data: OrgData,
  groupId: string,
  edgeStartIndex: number,
): {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  nextIndex: number;
  error?: string;
} {
  const group = data.groups.find((g) => g.id === groupId);
  if (!group) {
    return { nodes: [], edges: [], width: 0, height: 0, nextIndex: edgeStartIndex, error: '找不到組別' };
  }

  const assignments = data.assignments.filter((a) => a.groupId === groupId);
  const cycleErrors = detectReportingCycle(groupId, data.assignments);
  if (cycleErrors.length > 0) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      nextIndex: edgeStartIndex,
      error: cycleErrors.join('；'),
    };
  }

  const employeeIdsInGroup = new Set(assignments.map((a) => a.employeeId));

  const memberNodes: Node<AssignmentMemberNodeData>[] = assignments.map((a) => {
    const employee = data.employees.find((e) => e.id === a.employeeId)!;
    const jobLevel = data.jobLevels.find((j) => j.id === a.jobLevelId);
    return {
      id: assignmentNodeId(a.id),
      type: 'assignmentMember',
      position: { x: 0, y: 0 },
      data: {
        assignmentId: a.id,
        employeeId: a.employeeId,
        employee,
        jobLevelName: jobLevel?.name ?? '—',
        isPrimaryGroup: a.isPrimaryGroup,
        groupName: group.name,
      },
    };
  });

  const { edges, externalNodes, nextIndex } = buildEdgesForAssignments(
    data,
    assignments,
    employeeIdsInGroup,
    groupId,
    edgeStartIndex,
  );

  const flowNodes = [...memberNodes, ...externalNodes];
  if (flowNodes.length === 0) {
    const labelNode: Node<GroupLabelNodeData> = {
      id: groupLabelNodeId(groupId),
      type: 'groupLabel',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: { groupName: group.name, memberCount: 0 },
    };
    return {
      nodes: [labelNode],
      edges: [],
      width: 200,
      height: GROUP_LABEL_HEIGHT,
      nextIndex,
    };
  }

  const { nodes: laidOut, width, height } = layoutCluster(
    flowNodes,
    edges,
    nodeDimensions,
  );

  const labelNode: Node<GroupLabelNodeData> = {
    id: groupLabelNodeId(groupId),
    type: 'groupLabel',
    position: { x: Math.max(0, width / 2 - 100), y: 0 },
    draggable: false,
    selectable: false,
    data: { groupName: group.name, memberCount: assignments.length },
  };

  const offsetY = GROUP_LABEL_HEIGHT + CLUSTER_PADDING;
  const translated = laidOut.map((n) => ({
    ...n,
    position: {
      x: n.position.x + CLUSTER_PADDING,
      y: n.position.y + offsetY,
    },
  }));

  labelNode.position.x =
    CLUSTER_PADDING + Math.max(0, (width + CLUSTER_PADDING * 2) / 2 - 100);

  return {
    nodes: [labelNode, ...translated],
    edges,
    width: width + CLUSTER_PADDING * 2,
    height: height + offsetY + CLUSTER_PADDING,
    nextIndex,
  };
}

export function buildGroupMembershipGraph(
  data: OrgData,
  viewId: string,
  kindFilter?: GroupKind,
): GroupMembershipGraphResult {
  const isAll = viewId === ALL_GROUPS_VIEW_ID;
  const activeGroups = data.groups.filter(
    (g) => g.status === 'active' && (!kindFilter || g.kind === kindFilter),
  );

  if (!isAll) {
    // 單組視角：若該組種類不符過濾條件，視為空畫面（不渲染叢集）。
    const group = data.groups.find((g) => g.id === viewId);
    if (kindFilter && group && group.kind !== kindFilter) {
      return { nodes: [], edges: [] };
    }
    const result = buildCluster(data, viewId, 0);
    if (result.error) {
      return { nodes: [], edges: [], error: result.error };
    }
    return { nodes: result.nodes, edges: result.edges };
  }

  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  let xOffset = 0;
  let edgeIndex = 0;
  const errors: string[] = [];

  for (const group of activeGroups) {
    const result = buildCluster(data, group.id, edgeIndex);
    edgeIndex = result.nextIndex;
    if (result.error) {
      errors.push(`[${group.name}] ${result.error}`);
      continue;
    }
    const shifted = result.nodes.map((n) => ({
      ...n,
      position: {
        x: n.position.x + xOffset,
        y: n.position.y,
      },
    }));
    allNodes.push(...shifted);
    allEdges.push(...result.edges);
    xOffset += result.width + CLUSTER_GAP;
  }

  if (errors.length > 0 && allNodes.length === 0) {
    return { nodes: [], edges: [], error: errors.join('；') };
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    error: errors.length > 0 ? errors.join('；') : undefined,
  };
}

export function employeeIdFromMembershipNode(node: Node): string | null {
  if (node.type === 'assignmentMember') {
    return (node.data as AssignmentMemberNodeData).employeeId;
  }
  if (node.type === 'externalSupervisor') {
    return (node.data as ExternalSupervisorNodeData).employeeId;
  }
  return null;
}