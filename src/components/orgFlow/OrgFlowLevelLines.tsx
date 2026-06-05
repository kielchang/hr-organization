import { ViewportPortal } from '@xyflow/react';
import type { OrgFlowLevelLine } from '../../services/buildOrgFlowGraph';

interface OrgFlowLevelLinesProps {
  levels: OrgFlowLevelLine[];
  bounds: { minX: number; maxX: number };
}

/** 在畫布座標畫出各匯報層的水平階層線（隨平移縮放，置於節點下方） */
export function OrgFlowLevelLines({ levels, bounds }: OrgFlowLevelLinesProps) {
  if (levels.length === 0) return null;

  const PAD = 64;
  const left = bounds.minX - PAD;
  const width = Math.max(bounds.maxX - bounds.minX + PAD * 2, 200);

  return (
    <ViewportPortal>
      {levels.map((lv, i) => (
        <div
          key={i}
          className="org-flow-level-line"
          style={{
            position: 'absolute',
            transform: `translate(${left}px, ${lv.y}px)`,
            width,
          }}
        >
          <span className="org-flow-level-label">{lv.label}</span>
        </div>
      ))}
    </ViewportPortal>
  );
}
