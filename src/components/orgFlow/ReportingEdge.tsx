import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

/** 匯報線 edge 的 data 形狀，生產端（buildOrgFlowGraph）與消費端（本檔）共用。 */
export interface ReportingEdgeData {
  /** 主匯報（實線）為 true、次要匯報（虛線）為 false。 */
  isPrimary: boolean;
  /** 線上顯示文字。 */
  label: string;
  /** smoothstep 水平段下沉量（由 buildOrgFlowGraph 以 RANK_SEP/2 帶入）。 */
  offset: number;
  // @xyflow 的 Edge<EdgeData extends Record<string, unknown>> 要求可索引。
  [key: string]: unknown;
}

/**
 * 自訂匯報線：標籤透明底、浮在線水平段上方約 10px、與線平行（水平文字），
 * 線在底下連續不被切斷（內建 smoothstep label 的白底會把線切兩段，故自繪）。
 *
 * 路由參數與原 smoothstep 一致（borderRadius:12、offset 由 data.offset 帶入），
 * 視覺路由不變。線型由 data.isPrimary 決定：主匯報實線、次要虛線。
 */
export function ReportingEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<Edge<ReportingEdgeData>>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    // 正常一律由 data.offset 帶入（buildOrgFlowGraph = RANK_SEP/2）；
    // ?? 僅防呆缺 data 的邊，用 0（不偏移）而非偷複製 RANK_SEP 的魔數。
    offset: data?.offset ?? 0,
  });

  const isPrimary = data?.isPrimary === true;
  const label = data?.label;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={
          isPrimary
            ? { strokeWidth: 2 }
            : { strokeWidth: 1.5, strokeDasharray: '6 4' }
        }
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) translateY(-10px)`,
              fontSize: 10,
              color: 'var(--muted-foreground)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
