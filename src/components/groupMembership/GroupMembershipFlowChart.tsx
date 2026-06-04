import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Dropdown,
  Field,
  FluentProvider,
  MessageBar,
  MessageBarBody,
  Option,
  Text,
  webLightTheme,
} from '@fluentui/react-components';
import type { OptionOnSelectData } from '@fluentui/react-components';
import {
  ALL_GROUPS_VIEW_ID,
  buildGroupMembershipGraph,
  employeeIdFromMembershipNode,
} from '../../services/buildGroupMembershipGraph';
import { useOrg } from '../../context/OrgContext';
import { AssignmentMemberNode } from './AssignmentMemberNode';
import { ExternalSupervisorNode } from './ExternalSupervisorNode';
import { GroupLabelNode } from './GroupLabelNode';
import { OrgDetailPanel } from '../orgFlow/OrgDetailPanel';

const nodeTypes = {
  assignmentMember: AssignmentMemberNode,
  externalSupervisor: ExternalSupervisorNode,
  groupLabel: GroupLabelNode,
} as const;

interface GroupMembershipFlowChartProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  selectedEmployeeId: string | null;
  onNodeSelect: (employeeId: string | null) => void;
}

function FlowInner({
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

  const [nodes, setNodes] = useState(computedNodes);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds) as typeof nds),
    [],
  );

  useEffect(() => {
    if (computedNodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [computedNodes, edges, fitView, selectedGroupId]);

  const [showMiniMap, setShowMiniMap] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      ref={containerRef}
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
        fitView
        minZoom={0.15}
        maxZoom={1.5}
      >
        <Background gap={16} />
        <Controls />

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
            {showMiniMap ? '▼' : '▲'}　觀景窗
          </button>
          <div className={`minimap-slide${showMiniMap ? '' : ' minimap-slide--hidden'}`}>
            <MiniMap zoomable pannable nodeColor="#d0e4f7" nodeStrokeColor="#4a90d9" />
          </div>
        </Panel>

        {/* 左上角：組別選擇 */}
        <Panel position="top-left" className="org-flow-panel">
          <Field label="檢視組別">
            <Dropdown
              value={
                selectedGroupId === ALL_GROUPS_VIEW_ID
                  ? '全公司（各組並列）'
                  : (activeGroups.find((g) => g.id === selectedGroupId)?.name ??
                    '選擇組別')
              }
              selectedOptions={[selectedGroupId]}
              onOptionSelect={(_e, opt: OptionOnSelectData) => {
                if (opt.optionValue) onGroupChange(opt.optionValue);
              }}
            >
              <Option key={ALL_GROUPS_VIEW_ID} value={ALL_GROUPS_VIEW_ID} text="全公司（各組並列）">
                全公司（各組並列）
              </Option>
              {activeGroups.map((g) => (
                <Option key={g.id} value={g.id} text={g.name}>
                  {g.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Text size={200} className="org-flow-legend">
            每個節點為一筆組別歸屬；連線依該歸屬的主管設定。
            <br />
            <span className="legend-solid">━</span> 主主管
            <span className="legend-dashed">┄</span> 其他主管
          </Text>
        </Panel>
      </ReactFlow>

      {/* 人員詳情：獨立浮動方塊，位於 group selector 正下方 */}
      {selectedEmployeeId && (
        <div className="org-detail-float">
          <OrgDetailPanel
            employeeId={selectedEmployeeId}
            onClose={() => onNodeSelect(null)}
            chartMode="membership"
            containerRef={containerRef}
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
