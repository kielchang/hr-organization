import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  ALL_GROUPS_VIEW_ID,
  ORG_FLOW_LEVEL_GAP,
  buildOrgFlowGraph,
  levelFromTopY,
} from '../../services/buildOrgFlowGraph';
import { buildNodeDiffMap } from '../../services/computeOrgDiff';
import { EmployeeNode, type EmployeeNodeData } from './EmployeeNode';
import { OrgFlowLevelLines } from './OrgFlowLevelLines';
import { OrgFlowFullscreenButton, OrgFlowMiniMap } from './OrgFlowChartChrome';
import { OrgFlowControlBar, type OrgFlowNavMode } from './OrgFlowControlBar';
import { ORG_FLOW_NAV_PROPS } from './orgFlowNav';
import { OrgFlowTopBar } from './OrgFlowTopBar';
import { OrgDetailPanel } from './OrgDetailPanel';
import { DiffLegend } from './DiffLegend';
import type { OrgFlowChartVariant } from './OrgFlowControls';
import { useDraggableFlowNodes } from './useDraggableFlowNodes';
import type { OrgData, Assignment, Employee } from '../../types/org';
import type { OrgDiffResult } from '../../types/editSession';
import { upsertAssignment, upsertEmployee, createEmptyAssignment } from '../../services/orgOperations';
import { useOrg } from '../../context/useOrg';

const nodeTypes = { employee: EmployeeNode } as const;

export interface OrgFlowChartProps {
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  selectedEmployeeId: string | null;
  onNodeSelect: (employeeId: string | null) => void;
  isEditMode: boolean;
  orgData: OrgData;
  diffResult?: OrgDiffResult | null;
  onDraftChange: (next: OrgData) => void;
}

function FlowInner({
  variant,
  selectedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
  isEditMode,
  orgData,
  diffResult,
  onDraftChange,
}: OrgFlowChartProps) {
  const { operator } = useOrg();
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => orgData.groups.filter((g) => g.status === 'active'),
    [orgData.groups],
  );

  const { nodes: computedNodes, edges: baseEdges, error, levels, bounds } = useMemo(
    () => buildOrgFlowGraph(orgData, selectedGroupId),
    [orgData, selectedGroupId],
  );

  // Inject diffStatus into nodes when diffResult is present
  const diffMap = useMemo(() => {
    if (!diffResult) return undefined;
    const nodeIds = computedNodes.map((n) => n.id);
    return buildNodeDiffMap(diffResult, nodeIds);
  }, [diffResult, computedNodes]);

  // Build nodes with diff map applied
  const { nodes: computedNodesWithDiff } = useMemo(() => {
    if (!diffMap) return { nodes: computedNodes };
    return {
      nodes: computedNodes.map((n) => ({
        ...n,
        data: { ...n.data, diffStatus: diffMap.get(n.id) },
      })),
    };
  }, [computedNodes, diffMap]);

  // Append ghost nodes for removed employees during diff preview
  const { nodes: allComputedNodes, edges } = useMemo(() => {
    if (!diffResult || !diffResult.removedEmployeeIds.size) {
      return { nodes: computedNodesWithDiff, edges: baseEdges };
    }
    const ghostNodes: Node<EmployeeNodeData>[] = [];
    for (const eid of diffResult.removedEmployeeIds) {
      const emp = orgData.employees.find((e) => e.id === eid);
      if (!emp) continue;
      ghostNodes.push({
        id: `ghost-${eid}`,
        type: 'employee',
        position: { x: -300, y: 0 },
        data: {
          employee: emp,
          assignmentId: '',
          jobLevelName: '已移除',
          isPrimaryGroup: false,
          groupName: '',
          diffStatus: 'removed',
        },
        draggable: false,
      });
    }
    return { nodes: [...computedNodesWithDiff, ...ghostNodes], edges: baseEdges };
  }, [computedNodesWithDiff, baseEdges, diffResult, orgData.employees]);

  const { nodes, onNodesChange } = useDraggableFlowNodes(
    allComputedNodes,
    selectedGroupId,
    ORG_FLOW_LEVEL_GAP,
    isEditMode,
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!isEditMode) return;
      const d = node.data as EmployeeNodeData;
      if (d.levelTopY == null) return;
      const newLevel = levelFromTopY(node.position.y);
      const assignment = orgData.assignments.find((a) => a.id === d.assignmentId);
      if (!assignment || assignment.level === newLevel) return;

      // Assignments visible in current view (scope level calculations to view)
      const viewAssignments = selectedGroupId === ALL_GROUPS_VIEW_ID
        ? orgData.assignments
        : orgData.assignments.filter((a) => a.groupId === selectedGroupId);
      const currentMinLevel = Math.min(...viewAssignments.map((a) => a.level ?? 1));

      if (newLevel < currentMinLevel) {
        // Top-node dragged up past the minimum:
        // Keep top node at current min level; shift ALL other assignments down by 1.
        const updatedAssignments = orgData.assignments.map((a) =>
          a.id === assignment.id ? a : { ...a, level: (a.level ?? 1) + 1 },
        );
        onDraftChange({ ...orgData, assignments: updatedAssignments });
      } else {
        // Normal case: only this node's level changes.
        const result = upsertAssignment(orgData, { ...assignment, level: newLevel }, operator, false);
        if (!result.error) onDraftChange(result.data);
      }
    },
    [isEditMode, orgData, selectedGroupId, operator, onDraftChange],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isEditMode) return;
      const { source: supervisorId, target: subordinateId } = connection;
      if (!supervisorId || !subordinateId) return;
      const targetAssignment = orgData.assignments.find(
        (a) => a.employeeId === subordinateId && a.groupId === selectedGroupId,
      );
      if (!targetAssignment) return;
      if (targetAssignment.supervisorIds.includes(supervisorId)) return;
      const updated: Assignment = {
        ...targetAssignment,
        supervisorIds: [...targetAssignment.supervisorIds, supervisorId],
        primarySupervisorId: targetAssignment.primarySupervisorId ?? supervisorId,
      };
      const result = upsertAssignment(orgData, updated, operator, false);
      if (!result.error) onDraftChange(result.data);
    },
    [isEditMode, orgData, selectedGroupId, operator, onDraftChange],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!isEditMode) return;
      let next = orgData;
      for (const edge of deletedEdges) {
        const supervisorId = edge.source;
        const subordinateId = edge.target;
        const targetAssignment = next.assignments.find(
          (a) => a.employeeId === subordinateId && a.groupId === selectedGroupId,
        );
        if (!targetAssignment) continue;
        const updated: Assignment = {
          ...targetAssignment,
          supervisorIds: targetAssignment.supervisorIds.filter((s) => s !== supervisorId),
          primarySupervisorId:
            targetAssignment.primarySupervisorId === supervisorId
              ? null
              : targetAssignment.primarySupervisorId,
        };
        const result = upsertAssignment(next, updated, operator, false);
        if (!result.error) next = result.data;
      }
      if (next !== orgData) onDraftChange(next);
    },
    [isEditMode, orgData, selectedGroupId, operator, onDraftChange],
  );

  useEffect(() => {
    if (computedNodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [computedNodes, edges, fitView, selectedGroupId]);

  const hasDetail = !!selectedEmployeeId;
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [navMode, setNavMode] = useState<OrgFlowNavMode>('mouse');

  const containerRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const setChartContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setPortalContainer(node);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id.startsWith('ghost-') ? null : node.id);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Save callbacks for OrgDetailPanel — write to draft in edit mode
  const handleSaveEmployee = useCallback(
    (employee: Employee, isNew: boolean): string | null => {
      const result = upsertEmployee(orgData, employee, operator, isNew);
      if (result.error) return result.error;
      onDraftChange(result.data);
      return null;
    },
    [orgData, operator, onDraftChange],
  );

  const handleSaveAssignment = useCallback(
    (assignment: Assignment, isNew: boolean): string | null => {
      const result = upsertAssignment(orgData, assignment, operator, isNew);
      if (result.error) return result.error;
      onDraftChange(result.data);
      return null;
    },
    [orgData, operator, onDraftChange],
  );

  const handleNewAssignment = useCallback(
    (employeeId: string): Assignment => createEmptyAssignment(employeeId),
    [],
  );

  return (
    <div
      ref={setChartContainer}
      className={cn(
        'org-flow-chart relative h-full min-h-[480px] overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        isFullscreen && 'org-flow-chart--fullscreen',
      )}
    >
      <ReactFlow
        colorMode="light"
        nodes={nodes as import('@xyflow/react').Node[]}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
        onNodesChange={onNodesChange as import('@xyflow/react').OnNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        nodesDraggable={isEditMode}
        nodesConnectable={isEditMode}
        elementsSelectable
        deleteKeyCode={isEditMode ? 'Backspace' : null}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        {...ORG_FLOW_NAV_PROPS[navMode]}
      >
        <Background gap={20} size={1} color="var(--border)" />

        {levels && bounds && (
          <OrgFlowLevelLines levels={levels} bounds={bounds} />
        )}

        <Panel position="top-left" className="org-flow-chrome-panel !m-3">
          <div className="flex flex-col items-start gap-3">
            <OrgFlowTopBar
              variant={variant}
              selectedGroupId={selectedGroupId}
              onGroupChange={onGroupChange}
              activeGroups={activeGroups}
              mountNode={portalContainer}
            />
            {hasDetail && selectedEmployeeId && (
              <OrgDetailPanel
                employeeId={selectedEmployeeId}
                onClose={() => onNodeSelect(null)}
                portalContainer={portalContainer}
                orgData={orgData}
                isEditMode={isEditMode}
                onSaveEmployee={handleSaveEmployee}
                onSaveAssignment={handleSaveAssignment}
                onNewAssignment={handleNewAssignment}
              />
            )}
          </div>
        </Panel>

        {diffResult && (
          <Panel position="bottom-left" className="org-flow-chrome-panel !m-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-sm">
              <DiffLegend />
            </div>
          </Panel>
        )}

        <OrgFlowFullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />

        <Panel position="bottom-right" className="org-flow-chrome-panel !m-3">
          <div className="flex flex-col items-end gap-2">
            <OrgFlowMiniMap show={showMiniMap} onToggle={() => setShowMiniMap((v) => !v)} />
            <OrgFlowControlBar navMode={navMode} onNavModeChange={setNavMode} />
          </div>
        </Panel>
      </ReactFlow>

      {error && (
        <Alert
          variant="destructive"
          className="absolute bottom-3 left-3 right-3 z-10 border-destructive/30 bg-card/95 shadow-md backdrop-blur-sm"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function OrgFlowChart(props: OrgFlowChartProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
