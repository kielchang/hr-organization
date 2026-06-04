import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  buildGroupMembershipGraph,
  employeeIdFromMembershipNode,
} from '../../services/buildGroupMembershipGraph';
import { useOrg } from '../../context/useOrg';
import { AssignmentMemberNode } from './AssignmentMemberNode';
import { ExternalSupervisorNode } from './ExternalSupervisorNode';
import { GroupLabelNode } from './GroupLabelNode';
import { OrgFlowFullscreenButton } from '../orgFlow/OrgFlowChartChrome';
import { OrgFlowLeftStack } from '../orgFlow/OrgFlowLeftStack';
import type { OrgFlowChartVariant } from '../orgFlow/OrgFlowControls';
import { useDraggableFlowNodes } from '../orgFlow/useDraggableFlowNodes';
import { useOrgFlowMiniMapVisibility } from '../orgFlow/useOrgFlowMiniMapVisibility';
import { useOrgFlowSidebarWidth } from '../orgFlow/useOrgFlowSidebarWidth';

const nodeTypes = {
  assignmentMember: AssignmentMemberNode,
  externalSupervisor: ExternalSupervisorNode,
  groupLabel: GroupLabelNode,
} as const;

interface GroupMembershipFlowChartProps {
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  selectedEmployeeId: string | null;
  onNodeSelect: (employeeId: string | null) => void;
}

function FlowInner({
  variant,
  selectedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
}: GroupMembershipFlowChartProps) {
  const { data } = useOrg();
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => data.groups.filter((g) => g.status === 'active'),
    [data.groups],
  );

  const { nodes: computedNodes, edges, error } = useMemo(
    () => buildGroupMembershipGraph(data, selectedGroupId),
    [data, selectedGroupId],
  );

  const { nodes, onNodesChange } = useDraggableFlowNodes(
    computedNodes,
    selectedGroupId,
  );

  useEffect(() => {
    if (computedNodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [computedNodes, edges, fitView, selectedGroupId]);

  const hasDetail = !!selectedEmployeeId;
  const { showMiniMap, setShowMiniMap } = useOrgFlowMiniMapVisibility(hasDetail);

  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const setChartContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setPortalContainer(node);
  }, []);

  const sidebarWidth = useOrgFlowSidebarWidth(sidebarRef, true);

  const chartStyle =
    sidebarWidth > 0
      ? ({ '--org-flow-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties)
      : undefined;

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
      const eid = employeeIdFromMembershipNode(node);
      onNodeSelect(eid);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  return (
    <div
      ref={setChartContainer}
      className={cn(
        'org-flow-chart relative h-full min-h-[480px] overflow-hidden rounded-xl border border-border bg-muted/25 shadow-sm',
        isFullscreen && 'org-flow-chart--fullscreen',
      )}
      style={chartStyle}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls
          className="!rounded-lg !border-border !bg-card/90 !shadow-md [&>button]:!border-border [&>button]:!bg-background [&>button]:hover:!bg-muted"
        />

        <Panel
          position="top-left"
          className="org-flow-chrome-panel org-flow-sidebar-panel !m-0 !top-0 !left-0"
        >
          <OrgFlowLeftStack
            sidebarRef={sidebarRef}
            variant={variant}
            selectedGroupId={selectedGroupId}
            onGroupChange={onGroupChange}
            activeGroups={activeGroups}
            mountNode={portalContainer}
            selectedEmployeeId={selectedEmployeeId}
            onCloseDetail={() => onNodeSelect(null)}
            showMiniMap={showMiniMap}
            onToggleMiniMap={() => setShowMiniMap((v) => !v)}
            miniMapCompact={hasDetail}
          />
        </Panel>

        <OrgFlowFullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
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

export function GroupMembershipFlowChart(props: GroupMembershipFlowChartProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
