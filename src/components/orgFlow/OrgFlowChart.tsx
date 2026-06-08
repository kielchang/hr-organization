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
  ORG_FLOW_LEVEL_GAP,
  buildOrgFlowGraph,
  levelFromTopY,
} from '../../services/buildOrgFlowGraph';
import { buildNodeDiffMap } from '../../services/computeOrgDiff';
import { EmployeeNode, type EmployeeNodeData } from './EmployeeNode';
import { ReportingEdge } from './ReportingEdge';
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
import {
  upsertAssignment,
  upsertEmployee,
  createEmptyAssignment,
  reassignSupervisor,
} from '../../services/orgOperations';
import { useOrg } from '../../context/useOrg';

const nodeTypes = { employee: EmployeeNode } as const;
const edgeTypes = { reporting: ReportingEdge } as const;

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
  const { fitView, getIntersectingNodes } = useReactFlow();
  /** drag-to-reassign 失敗時的短暫提示（循環/inactive/自我）；成功則清空。 */
  const [reassignError, setReassignError] = useState<string | null>(null);
  /** 拖曳過程中懸停可放置的目標員工節點 id（用於高亮），未懸停為 null。 */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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

  // 把 drag-to-reassign 懸停高亮注入節點 data（不改動拖曳位置狀態）。
  const renderedNodes = useMemo(() => {
    if (!dropTargetId) return nodes;
    return nodes.map((n) =>
      n.id === dropTargetId
        ? { ...n, data: { ...n.data, isDropTarget: true } }
        : n,
    );
  }, [nodes, dropTargetId]);

  /**
   * 取被拖節點重疊的「最上層員工節點」當 drop target。
   * 過濾自己與 ghost（已移除預覽）節點；reporting 視角下 node.id === employeeId。
   */
  const findDropTarget = useCallback(
    (node: Node): Node | null => {
      const hits = getIntersectingNodes(node, false).filter(
        (n) => n.id !== node.id && !n.id.startsWith('ghost-'),
      );
      if (hits.length === 0) return null;
      // 「最上層」＝畫面 z 序最後者（後繪在上）；getIntersectingNodes 依現有節點順序回傳，取末筆。
      return hits[hits.length - 1];
    },
    [getIntersectingNodes],
  );

  /** 把某節點視覺位置回滾到 computed 佈局（避免拖拉失敗後停在亂位）。 */
  const resetNodePosition = useCallback(
    (nodeId: string) => {
      const computed = allComputedNodes.find((n) => n.id === nodeId);
      if (!computed) return;
      onNodesChange([
        { id: nodeId, type: 'position', position: { ...computed.position } },
      ]);
    },
    [allComputedNodes, onNodesChange],
  );

  const onNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent | React.MouseEvent, node: Node) => {
      if (!isEditMode) return;
      const target = findDropTarget(node);
      setDropTargetId((prev) => (prev === (target?.id ?? null) ? prev : target?.id ?? null));
    },
    [isEditMode, findDropTarget],
  );

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent | React.MouseEvent, node: Node) => {
      if (!isEditMode) {
        setDropTargetId(null);
        return;
      }
      const d = node.data as EmployeeNodeData;

      // drag-to-reassign：所見即所得 —— drop 命中優先採用 onNodeDrag 高亮時已算好的
      // dropTargetId（employeeId / reporting node.id），避免 z 序變動造成「高亮的」與
      // 「實際掛上的」不一致。dropTargetId 為 null 時 fallback 重算（語意等價）。
      const targetId = dropTargetId ?? findDropTarget(node)?.id ?? null;
      if (targetId) {
        // reporting 視角：drop target 的 node.id 即新主管的 employeeId。
        const result = reassignSupervisor(orgData, d.assignmentId, targetId, operator);
        if (result.error) {
          // 失敗（循環/inactive/自我）：不提交、回滾被拖節點視覺位置、顯示原因。
          setReassignError(result.error);
          resetNodePosition(node.id);
        } else {
          setReassignError(null);
          onDraftChange(result.data);
        }
        setDropTargetId(null);
        return;
      }

      // 未命中（dropTargetId 為 null 且重算亦無命中）：垂直拖曳 → 設定該節點的
      // 「層級覆寫」（assignment.level）。預設層級由主匯報深度自動計算，這裡僅
      // 為單一節點寫入稀疏覆寫，不再 cascade 影響其他節點。
      setDropTargetId(null);
      if (d.levelTopY == null) return;
      const newLevel = levelFromTopY(node.position.y);
      const assignment = orgData.assignments.find((a) => a.id === d.assignmentId);
      if (!assignment || assignment.level === newLevel) return;

      const result = upsertAssignment(
        orgData,
        { ...assignment, level: newLevel },
        operator,
        false,
      );
      if (!result.error) onDraftChange(result.data);
    },
    [
      isEditMode,
      orgData,
      operator,
      onDraftChange,
      findDropTarget,
      resetNodePosition,
      dropTargetId,
    ],
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

  // drag-to-reassign 失敗提示：數秒後自動消失。
  useEffect(() => {
    if (!reassignError) return;
    const t = setTimeout(() => setReassignError(null), 4000);
    return () => clearTimeout(t);
  }, [reassignError]);

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
        nodes={renderedNodes as import('@xyflow/react').Node[]}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
        edgeTypes={edgeTypes as import('@xyflow/react').EdgeTypes}
        onNodesChange={onNodesChange as import('@xyflow/react').OnNodesChange}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
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

      {reassignError && (
        <Alert
          variant="destructive"
          role="alert"
          className="absolute left-3 right-3 top-3 z-10 border-destructive/30 bg-card/95 shadow-md backdrop-blur-sm"
        >
          <AlertDescription>{reassignError}</AlertDescription>
        </Alert>
      )}

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
