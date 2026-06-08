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
  /**
   * 是否在 computedNodes 重算時保留目前的拖曳位置。
   * 僅編輯模式需要（避免拖曳中途因資料重算而位置跳掉）；
   * 檢視模式應永遠跟隨資料計算的位置，否則切換版本/資料後會殘留舊位置。
   */
  preserveDraggedPositions = true,
) {
  const [nodes, setNodes] = useState<T[]>(computedNodes);
  const resetKeyRef = useRef(resetKey);
  const snapStepRef = useRef(snapStep);
  // 在 effect 中同步最新 snapStep，供 onNodesChange 取用（避免 render 期間寫 ref）。
  useEffect(() => {
    snapStepRef.current = snapStep;
  }, [snapStep]);

  // 將外部 dagre 計算結果同步進本地拖曳狀態（保留拖曳中位置）。
  // 這是「以 props 為來源、本地可覆寫」的受控同步，必須在 effect 內 setState。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setNodes(computedNodes);
      return;
    }

    if (!preserveDraggedPositions) {
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
  }, [computedNodes, resetKey, preserveDraggedPositions]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
