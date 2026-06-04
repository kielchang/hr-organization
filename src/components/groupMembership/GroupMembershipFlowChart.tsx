import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FluentProvider,
  MessageBar,
  MessageBarBody,
  webLightTheme,
} from '@fluentui/react-components';
import {
  buildGroupMembershipGraph,
  employeeIdFromMembershipNode,
} from '../../services/buildGroupMembershipGraph';
import { useOrg } from '../../context/useOrg';
import { AssignmentMemberNode } from './AssignmentMemberNode';
import { ExternalSupervisorNode } from './ExternalSupervisorNode';
import { GroupLabelNode } from './GroupLabelNode';
import { OrgDetailPanel } from '../orgFlow/OrgDetailPanel';
import { OrgFlowControls, type OrgFlowChartVariant } from '../orgFlow/OrgFlowControls';
import { useDraggableFlowNodes } from '../orgFlow/useDraggableFlowNodes';

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

  const selectedEmployee = selectedEmployeeId
    ? data.employees.find((e) => e.id === selectedEmployeeId)
    : undefined;

  useEffect(() => {
    if (computedNodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [computedNodes, edges, fitView, selectedGroupId]);

  const [showMiniMap, setShowMiniMap] = useState(true);

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
      className={`org-flow-chart${isFullscreen ? ' org-flow-chart--fullscreen' : ''}`}
      ref={setChartContainer}
    >
      <FluentProvider theme={webLightTheme} className="org-flow-fluent-root">
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
      >
        <Background gap={16} />
        <Controls />

        <Panel position="top-left" className="org-flow-panel">
          <OrgFlowControls
            variant={variant}
            selectedGroupId={selectedGroupId}
            onGroupChange={onGroupChange}
            activeGroups={activeGroups}
            mountNode={portalContainer}
          />
        </Panel>

        {/* 全螢幕按鈕 — 右上角 */}
        <Panel position="top-right" className="fullscreen-panel">
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? '離開全螢幕' : '全螢幕'}
          >
            {isFullscreen ? '✕ 離開' : '⤢ 全螢幕'}
          </button>
        </Panel>

        {/* MiniMap — 右下角 */}
        <Panel position="bottom-right" className="minimap-panel">
          <button
            className="minimap-toggle-tab"
            onClick={() => setShowMiniMap((v) => !v)}
            title={showMiniMap ? '隱藏觀景窗' : '顯示觀景窗'}
          >
            {showMiniMap ? '▼' : '▲'} 觀景窗
          </button>
          <div className={`minimap-slide${showMiniMap ? '' : ' minimap-slide--hidden'}`}>
            <MiniMap zoomable pannable nodeColor="#d0e4f7" nodeStrokeColor="#4a90d9" />
          </div>
        </Panel>

        </ReactFlow>

        {selectedEmployeeId && selectedEmployee && (
          <div className="org-detail-float">
            <OrgDetailPanel
              employeeId={selectedEmployeeId}
              onClose={() => onNodeSelect(null)}
              portalContainer={portalContainer}
            />
          </div>
        )}

        {error && (
          <MessageBar intent="error" className="org-flow-error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
      </FluentProvider>
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
