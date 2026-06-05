import { useCallback, useEffect, useRef, useState } from 'react';
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react';

/**
 * 以 dagre 計算結果為基礎處理拖曳。
 * 傳入 `snapStep`（層高）時，帶 `levelTopY` 的節點拖曳會「吸附到層高網格」，
 * 維持在階層水平線上，且可超出現有範圍（拖到網格上一格＝新增上層、下一格＝層數+1）；
 * 放開後由呼叫端（onNodeDragStop）依最終 Y 提交層級變更。
 */
export function useDraggableFlowNodes<T extends Node>(
  computedNodes: T[],
  resetKey: string,
  snapStep?: number,
) {
  const [nodes, setNodes] = useState<T[]>(computedNodes);
  const resetKeyRef = useRef(resetKey);
  const snapStepRef = useRef(snapStep);
  snapStepRef.current = snapStep;

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
  }, [computedNodes, resetKey]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const step = snapStepRef.current;
      const snapped =
        step && step > 0
          ? changes.map((change) => {
              if (change.type !== 'position' || !change.position) return change;
              const node = nds.find((n) => n.id === change.id);
              const hasLevel =
                (node?.data as { levelTopY?: number } | undefined)?.levelTopY != null;
              if (!hasLevel) return change;
              // 吸附到層高網格（可為負或超出範圍）
              const snappedY = Math.round(change.position.y / step) * step;
              return {
                ...change,
                position: { x: change.position.x, y: snappedY },
              };
            })
          : changes;
      return applyNodeChanges(snapped, nds) as T[];
    });
  }, []);

  return { nodes, onNodesChange };
}
