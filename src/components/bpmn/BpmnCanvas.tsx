import { useCallback, useMemo } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { bpmnNodeTypes } from './nodes/BpmnNodes';
import type { BpmnFlowEdge, BpmnFlowNode } from '../../types/bpmn';

interface BpmnCanvasProps {
  nodes: BpmnFlowNode[];
  edges: BpmnFlowEdge[];
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  onNodesChange?: (nodes: BpmnFlowNode[]) => void;
  onEdgesChange?: (edges: BpmnFlowEdge[]) => void;
  onNodeSelect?: (id: string | null) => void;
  readonly?: boolean;
}

function toFlowNode(n: BpmnFlowNode, highlightedIds: string[]): Node {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, __highlighted: highlightedIds.includes(n.id) },
    selected: false,
  };
}

function toFlowEdge(e: BpmnFlowEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--border)', strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
    labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.9 },
  };
}

function CanvasInner({
  nodes: initNodes,
  edges: initEdges,
  highlightedNodeIds = [],
  onNodesChange: notifyNodes,
  onEdgesChange: notifyEdges,
  onNodeSelect,
  readonly = false,
}: BpmnCanvasProps) {
  const flowNodes = useMemo(
    () => initNodes.map((n) => toFlowNode(n, highlightedNodeIds)),
    [initNodes, highlightedNodeIds],
  );
  const flowEdges = useMemo(() => initEdges.map(toFlowEdge), [initEdges]);

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // sync back position changes
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (notifyNodes) {
        // rebuild from current nodes after change
        const updated = nodes
          .map((n) => {
            const change = changes.find((c) => 'id' in c && c.id === n.id);
            if (change?.type === 'position' && change.position) {
              return { ...n, position: change.position };
            }
            return n;
          })
          .map((n): BpmnFlowNode => ({
            id: n.id,
            type: n.type as BpmnFlowNode['type'],
            position: n.position as { x: number; y: number },
            data: n.data as BpmnFlowNode['data'],
          }));
        notifyNodes(updated);
      }
    },
    [onNodesChange, nodes, notifyNodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds));
    },
    [setEdges],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onNodeSelect?.(node.id),
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => onNodeSelect?.(null), [onNodeSelect]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        colorMode="light"
        nodes={nodes}
        edges={edges}
        nodeTypes={bpmnNodeTypes as import('@xyflow/react').NodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={!readonly}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="var(--border)" />
      </ReactFlow>
    </div>
  );
}

export function BpmnCanvas(props: BpmnCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
