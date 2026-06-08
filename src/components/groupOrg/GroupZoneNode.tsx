import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Crown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupZoneNodeData } from '../../services/buildGroupOrgGraph';

/**
 * GroupZoneNode 的繪圖用 data：在 D1 產出的 {@link GroupZoneNodeData}（只帶 id）之上，
 * 由 GroupOrgFlowChart 層解析出姓名後注入（leaderName/coLeaderNames）。
 *
 * 取姓名策略（最小改動）：**不擴充 D1 的 GroupZoneNodeData、不碰 buildGroupOrgGraph**，
 * 而是在 GroupOrgFlowChart 用 employees map 把 leaderId/coLeaderIds 查成姓名後注入。
 */
export interface GroupZoneRenderData extends GroupZoneNodeData {
  /** 組長姓名（查無或無組長時為 null）。 */
  leaderName: string | null;
  /** 共管（co-leader）姓名陣列，順序對齊 coLeaderIds。 */
  coLeaderNames: string[];
  /** 拖曳改組懸停目標時高亮（放開＝把被拖成員改到此組）。 */
  isDropTarget?: boolean;
}

/**
 * React Flow 自訂節點（type `groupZone`）：組別**背景分區**（泳道感、非容器框）。
 *
 * 設計取代舊 `GroupBoxNode`（dashed 邊框 + 標題列 + 框內層級線）：
 * - **背景色塊**：每組依 `hue` 套 subtle 淡色填充 + 極淡邊（非實心、非 dashed 框）；
 *   攤平的成員頂層節點疊於其上，呈「同組聚在一起的背景分區」。
 * - **角落小標籤**（左上）：組名 + 組長徽章（+ 若有共管徽章）。徽章以文字＋icon
 *   表達語意（不只靠顏色，符合 a11y）。標籤不擋成員——整層 `pointer-events-none`。
 * - **無框內層級輔助線**（已移除 levelLines）。
 *
 * 分區為**背景、低層、不互動**：node 層級已由佈局設 `zIndex:0` +
 * `selectable/draggable/connectable/deletable=false`；本元件再以 `pointer-events-none`
 * 確保不擋疊於上方的成員節點點擊。尺寸由佈局以 node `style.width/height` 套用，
 * 本元件填滿（h/w-full）。`aria-label` 標出組別與組長（語意不只靠顏色）。
 */
function GroupZoneNodeComponent({ data }: NodeProps) {
  const d = data as GroupZoneRenderData;
  const coLeaderText =
    d.coLeaderNames.length > 0 ? d.coLeaderNames.join('、') : null;

  const ariaLabel = `組別分區 ${d.groupName}（組長：${d.leaderName ?? '未指定'}${
    coLeaderText ? `；共管：${coLeaderText}` : ''
  }）${d.isDropTarget ? '：放開可將成員改入此組' : ''}`;

  return (
    <div
      className={cn(
        'group-org-zone pointer-events-none h-full w-full',
        // 拖曳改組懸停高亮（同色相加深 + 內框），與員工 drop target 樣式區隔。
        d.isDropTarget && 'group-org-zone--drop-target',
      )}
      // CSS 變數承載分區色相；--zone-hue 供 .group-org-zone 套低彩度淡色背景/邊。
      style={{ ['--zone-hue' as string]: String(d.hue) }}
      // 分區為背景視覺分組；aria 標示組別與組長供讀屏使用者理解（不只靠顏色）。
      role="group"
      aria-label={ariaLabel}
    >
      {/* 角落小標籤（左上）：組名 + 組長/共管徽章；pointer-events-none 不擋成員。 */}
      <div className="group-org-zone__label pointer-events-none absolute left-2 top-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold leading-tight text-foreground/80">
          {d.groupName}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/90 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
          <Crown className="size-2.5 shrink-0" aria-hidden="true" />
          組長：{d.leaderName ?? '未指定'}
        </span>
        {coLeaderText && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/80 bg-sky-50/90 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
            <Users className="size-2.5 shrink-0" aria-hidden="true" />
            共管：{coLeaderText}
          </span>
        )}
      </div>
    </div>
  );
}

export const GroupZoneNode = memo(GroupZoneNodeComponent);
