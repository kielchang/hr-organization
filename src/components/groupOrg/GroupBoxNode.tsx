import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Crown, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GroupBoxNodeData } from '../../services/buildGroupOrgGraph';

/**
 * GroupBoxNode 的繪圖用 data：在 D1 產出的 {@link GroupBoxNodeData}（只帶 id）之上，
 * 由 GroupOrgFlowChart 層解析出姓名後注入（leaderName/coLeaderNames）。
 *
 * 取姓名策略（最小改動）：**不擴充 D1 的 GroupBoxNodeData、不碰 buildGroupOrgGraph**，
 * 而是在 GroupOrgFlowChart 用 employees map 把 leaderId/coLeaderIds 查成姓名後，
 * post-process 注入這兩個欄位。D1 純佈局/推導職責不變。
 */
export interface GroupBoxRenderData extends GroupBoxNodeData {
  /** 組長姓名（查無或無組長時為 null）。 */
  leaderName: string | null;
  /** 共管（co-leader）姓名陣列，順序對齊 coLeaderIds。 */
  coLeaderNames: string[];
}

/**
 * React Flow 自訂節點（type `groupBox`）：組別群組框。
 *
 * 版面：
 * - **標題列**（實底、可讀）：組名 + 「組長：{姓名}」徽章 +（若有）「共管：{姓名…}」徽章。
 *   徽章以文字＋icon 表達語意（不只靠顏色，符合 a11y）。
 * - **本體區**（半透明背景 + 邊框）：留給成員子節點疊在其上；本體本身
 *   `pointer-events-none` 讓子節點維持可互動、群組框不擋點擊；標題列 `pointer-events-auto`
 *   以便日後（E 階段）可於標題列操作，但 D2 唯讀不接事件。
 * - **組內層級輔助線**（本體區）：沿用匯報視圖「第N層」概念但相對各組框——
 *   每條淡色虛線橫跨框寬 + 左側「第N層」小字，置於成員節點下方（背景輔助）、
 *   `pointer-events-none`、`aria-hidden`（裝飾性；語意已由文字承載）。
 *
 * 組間階層邊（department 樹 parent→child）以 RF v12 的 {@link Handle} 錨定：
 * 父框底（source/Bottom）→ 子框頂（target/Top）。Handle 唯讀
 * （`isConnectable={false}`），不可手動連線，僅供既有邊渲染錨點。
 *
 * 尺寸由佈局以 node `style.width/height` 套用；本元件填滿父容器（h/w-full）。
 * 群組框不可選、不被拖曳（由 GroupOrgFlowChart 設定 selectable/draggable=false）。
 */
function GroupBoxNodeComponent({ data }: NodeProps) {
  const d = data as GroupBoxRenderData;
  const coLeaderText =
    d.coLeaderNames.length > 0 ? d.coLeaderNames.join('、') : null;

  return (
    <div
      className="pointer-events-none relative flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border/70 bg-muted/25"
      // 群組框純為視覺容器；子節點疊在上方。aria 標示供讀屏使用者理解這是組別容器。
      role="group"
      aria-label={`組別 ${d.groupName}`}
    >
      {/*
        組間階層邊（department parent→child）的錨點：父框底→子框頂。
        唯讀（isConnectable=false）、低調樣式（透明小點），不干擾標題與成員。
        position 絕對置中於框頂/框底，RF v12 邊以此 Handle 渲染。
      */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!h-1.5 !w-1.5 !min-w-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!h-1.5 !w-1.5 !min-w-0 !border-0 !bg-transparent"
      />
      {/*
        組內層級輔助線：置於成員節點下方（DOM 先繪 → z 序低）、整層 pointer-events-none、
        aria-hidden（裝飾性；「第N層」文字僅供視覺輔助）。y 為框內相對座標
        （由 buildGroupOrgGraph 算出，與成員節點同一套位移）。
      */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
      >
        {d.levelLines.map((lv) => (
          <div
            key={lv.level}
            className="group-org-level-line"
            style={{ position: 'absolute', top: lv.y, left: 0, right: 0 }}
          >
            <span className="group-org-level-label">{lv.label}</span>
          </div>
        ))}
      </div>
      {/* 標題列：實底、文字可讀；獨立 pointer-events-auto（D2 不接事件但保留語意層） */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 bg-card/95 px-3 py-2 ring-1 ring-foreground/5 backdrop-blur-sm">
        <span className="text-sm font-semibold leading-tight text-card-foreground">
          {d.groupName}
        </span>
        <Badge
          variant="outline"
          className="gap-1 border-amber-300 bg-amber-50 text-[11px] font-medium text-amber-800"
        >
          <Crown className="size-3 shrink-0" aria-hidden="true" />
          組長：{d.leaderName ?? '未指定'}
        </Badge>
        {coLeaderText && (
          <Badge
            variant="outline"
            className="gap-1 border-sky-300 bg-sky-50 text-[11px] font-medium text-sky-800"
          >
            <Users className="size-3 shrink-0" aria-hidden="true" />
            共管：{coLeaderText}
          </Badge>
        )}
      </div>
      {/* 本體區：半透明、不擋互動，成員子節點疊於其上 */}
      <div className={cn('min-h-0 flex-1')} aria-hidden="true" />
    </div>
  );
}

export const GroupBoxNode = memo(GroupBoxNodeComponent);
