import { useEffect, useRef } from 'react';
import { useNodesState, type Node } from '@xyflow/react';

/**
 * 以 dagre 計算結果為基礎，並用 useNodesState 處理拖曳（避免自訂 onNodesChange 造成卡頓與節點消失）。
 */
export function useDraggableFlowNodes<T extends Node>(
  computedNodes: T[],
  resetKey: string,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setNodes(computedNodes);
      return;
    }

    setNodes((current) => {
      if (current.length === 0) return computedNodes;
      const byId = new Map(current.map((n) => [n.id, n]));
      return computedNodes.map((cn) => {
        const prev = byId.get(cn.id);
        return prev ? { ...cn, position: prev.position } : cn;
      });
    });
  }, [computedNodes, resetKey, setNodes]);

  return { nodes, onNodesChange };
}
