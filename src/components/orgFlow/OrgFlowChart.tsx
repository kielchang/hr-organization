import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { buildOrgFlowGraph } from '../../services/buildOrgFlowGraph';
import { useOrg } from '../../context/useOrg';
import { EmployeeNode } from './EmployeeNode';
import { OrgFlowFullscreenButton, OrgFlowMiniMap } from './OrgFlowChartChrome';
import { OrgFlowControlBar, type OrgFlowNavMode } from './OrgFlowControlBar';
import { ORG_FLOW_NAV_PROPS } from './orgFlowNav';
import { OrgFlowTopBar } from './OrgFlowTopBar';
import { OrgDetailPanel } from './OrgDetailPanel';
import type { OrgFlowChartVariant } from './OrgFlowControls';
import { useDraggableFlowNodes } from './useDraggableFlowNodes';

const nodeTypes = { employee: EmployeeNode } as const;

interface OrgFlowChartProps {
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
}: OrgFlowChartProps) {
  const { data } = useOrg();
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => data.groups.filter((g) => g.status === 'active'),
    [data.groups],
  );

  const { nodes: computedNodes, edges, error } = useMemo(
    () => buildOrgFlowGraph(data, selectedGroupId),
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
      onNodeSelect(node.id);
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
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        {...ORG_FLOW_NAV_PROPS[navMode]}
      >
        <Background gap={20} size={1} color="var(--border)" />

        {/* 左上角：檢視組別（底線下拉）＋圖例，下方堆疊人員詳情卡片 */}
        <Panel position="top-left" className="org-flow-chrome-panel !m-3">
          <div className="flex flex-col items-start gap-3">
            <OrgFlowTopBar
              variant={variant}
              selectedGroupId={selectedGroupId}
              onGroupChange={onGroupChange}
              activeGroups={activeGroups}
              mountNode={portalContainer}
            />
            {hasDetail && (
              <OrgDetailPanel
                employeeId={selectedEmployeeId}
                onClose={() => onNodeSelect(null)}
                portalContainer={portalContainer}
              />
            )}
          </div>
        </Panel>

        {/* 右上角：全螢幕 */}
        <OrgFlowFullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />

        {/* 右下角：觀景窗 + 控制列 */}
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
