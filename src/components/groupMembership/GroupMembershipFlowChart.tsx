import { useCallback, useEffect, useMemo } from 'react';
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
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Text,
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

const nodeTypes = {
  assignmentMember: AssignmentMemberNode,
  externalSupervisor: ExternalSupervisorNode,
  groupLabel: GroupLabelNode,
} as const;

interface GroupMembershipFlowChartProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  onNodeSelect: (employeeId: string | null) => void;
}

function FlowInner({
  selectedGroupId,
  onGroupChange,
  onNodeSelect,
}: GroupMembershipFlowChartProps) {
  const { data } = useOrg();
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => data.groups.filter((g) => g.status === 'active'),
    [data.groups],
  );

  const { nodes, edges, error } = useMemo(
    () => buildGroupMembershipGraph(data, selectedGroupId),
    [data, selectedGroupId],
  );

  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [nodes, edges, fitView, selectedGroupId]);

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
    <div className="org-flow-chart">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
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
        <MiniMap zoomable pannable />
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
              <Option
                key={ALL_GROUPS_VIEW_ID}
                value={ALL_GROUPS_VIEW_ID}
                text="全公司（各組並列）"
              >
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
      {error && (
        <MessageBar intent="error" className="org-flow-error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
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
