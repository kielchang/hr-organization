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
  buildOrgFlowGraph,
} from '../../services/buildOrgFlowGraph';
import { useOrg } from '../../context/OrgContext';
import { EmployeeNode } from './EmployeeNode';

const nodeTypes = { employee: EmployeeNode } as const;

interface OrgFlowChartProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  onNodeSelect: (employeeId: string | null) => void;
}

function FlowInner({
  selectedGroupId,
  onGroupChange,
  onNodeSelect,
}: OrgFlowChartProps) {
  const { data } = useOrg();
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => data.groups.filter((g) => g.status === 'active'),
    [data.groups],
  );

  const { nodes, edges, error } = useMemo(
    () => buildOrgFlowGraph(data, selectedGroupId),
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
      onNodeSelect(node.id);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  return (
    <div className="org-flow-chart">
      <ReactFlow
        nodes={nodes as import('@xyflow/react').Node[]}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.2}
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
                  ? '全公司'
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
                text="全公司"
              >
                全公司
              </Option>
              {activeGroups.map((g) => (
                <Option key={g.id} value={g.id} text={g.name}>
                  {g.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Text size={200} className="org-flow-legend">
            <span className="legend-solid">━</span> 主匯報　
            <span className="legend-dashed">┄</span> 虛線匯報
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

export function OrgFlowChart(props: OrgFlowChartProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
