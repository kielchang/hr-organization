import { useCallback, useEffect, useMemo } from 'react';
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
import { bpmnNodeTypes } from './nodes/bpmnNodeTypes';
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

/** 比較兩個節點 data，用來判斷 props 是否帶來實質的屬性變更 */
function shallowEqualData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
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

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // 同步外部 props 進畫布（新增/刪除節點、屬性編輯、highlight）。
  // 既有節點完整沿用畫布內部物件（保留位置、拖曳量測與選取等 React Flow 內部狀態），
  // 只有在 data/type 真的改變時才更新 —— 如此純位置回拋（拖曳 echo）不會重建節點，
  // 避免「拖曳到一半位置跳掉」的回歸；無實質差異時回傳原陣列讓 React 略過重繪。
  useEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      let changed = current.length !== flowNodes.length;
      const next = flowNodes.map((fn) => {
        const existing = byId.get(fn.id);
        if (!existing) {
          changed = true;
          return fn;
        }
        if (
          existing.type !== fn.type ||
          !shallowEqualData(
            existing.data as Record<string, unknown>,
            fn.data as Record<string, unknown>,
          )
        ) {
          changed = true;
          return { ...existing, type: fn.type, data: fn.data };
        }
        return existing;
      });
      return changed ? next : current;
    });
  }, [flowNodes, setNodes]);

  // 同步外部 props 的 edges；既有 edge 沿用內部物件，僅在 source/target/label 改變時更新，
  // 無實質差異時回傳原陣列，避免覆寫剛拉好的連線或造成多餘重繪。
  useEffect(() => {
    setEdges((current) => {
      const byId = new Map(current.map((e) => [e.id, e]));
      let changed = current.length !== flowEdges.length;
      const next = flowEdges.map((fe) => {
        const existing = byId.get(fe.id);
        if (!existing) {
          changed = true;
          return fe;
        }
        if (
          existing.source !== fe.source ||
          existing.target !== fe.target ||
          existing.label !== fe.label
        ) {
          changed = true;
          return { ...existing, source: fe.source, target: fe.target, label: fe.label };
        }
        return existing;
      });
      return changed ? next : current;
    });
  }, [flowEdges, setEdges]);

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
      const id = `e-${Date.now()}`;
      setEdges((eds) => addEdge({ ...params, id, type: 'smoothstep' }, eds));
      // 讓父層成為連線的唯一真實來源，否則 edges 的同步 effect 會把這條新連線覆寫掉，
      // 且儲存時也讀不到它。沿用既有 initEdges 以保留各 edge 的 condition 等欄位。
      if (notifyEdges && params.source && params.target) {
        notifyEdges([...initEdges, { id, source: params.source, target: params.target }]);
      }
    },
    [setEdges, notifyEdges, initEdges],
  );

  // 套用內部 edge 變更（選取、刪除…），並把「刪除」回拋父層以保持一致。
  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (notifyEdges) {
        const removed = changes
          .filter((c): c is Extract<typeof c, { type: 'remove' }> => c.type === 'remove')
          .map((c) => c.id);
        if (removed.length) {
          notifyEdges(initEdges.filter((e) => !removed.includes(e.id)));
        }
      }
    },
    [onEdgesChange, notifyEdges, initEdges],
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
        onEdgesChange={handleEdgesChange}
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
