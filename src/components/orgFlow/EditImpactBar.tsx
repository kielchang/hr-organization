import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  HealthMetricDelta,
  OrgHealthDelta,
} from '../../services/orgHealth';

/**
 * 編輯態 before→after 指標浮層（R5.2）。
 *
 * - 僅編輯模式渲染（由呼叫端以 isEditMode 把關）。
 * - 資料源：compareOrgHealth(session.baseData, session.draftData)。
 * - a11y：方向不靠顏色/箭頭單獨表達，另以「改善／惡化／持平」文字 + 帶正負號的差值傳達。
 */

/** avgSpan 顯示一位小數；其餘為整數計數，直接顯示原值。 */
function formatMetricValue(key: HealthMetricDelta['key'], value: number): string {
  return key === 'avgSpan' ? value.toFixed(1) : String(value);
}

/** 差值帶正負號（0 顯示 ±0）；avgSpan 一位小數。 */
function formatDelta(metric: HealthMetricDelta): string {
  const abs = Math.abs(metric.delta);
  const magnitude = metric.key === 'avgSpan' ? abs.toFixed(1) : String(abs);
  if (metric.delta > 0) return `+${magnitude}`;
  if (metric.delta < 0) return `−${magnitude}`;
  return `±${magnitude}`;
}

const DIRECTION_TEXT: Record<HealthMetricDelta['direction'], string> = {
  improved: '改善',
  worsened: '惡化',
  unchanged: '持平',
};

/** 文字色：沿用 -foreground 教訓，text 用飽和色而非近白的 *-foreground。 */
const DIRECTION_TEXT_CLASS: Record<HealthMetricDelta['direction'], string> = {
  improved: 'text-success',
  worsened: 'text-destructive',
  unchanged: 'text-muted-foreground',
};

function MetricCell({ metric }: { metric: HealthMetricDelta }) {
  const directionText = DIRECTION_TEXT[metric.direction];
  const directionClass = DIRECTION_TEXT_CLASS[metric.direction];
  const Arrow =
    metric.delta > 0 ? ArrowUp : metric.delta < 0 ? ArrowDown : Minus;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{metric.label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatMetricValue(metric.key, metric.before)}
        </span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          →
        </span>
        <span
          className={cn('text-sm font-semibold tabular-nums', directionClass)}
        >
          {formatMetricValue(metric.key, metric.after)}
        </span>
        <span className={cn('flex items-center gap-0.5 text-xs', directionClass)}>
          <Arrow className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{formatDelta(metric)}</span>
        </span>
      </div>
      {/* 純文字方向（screen reader 與色弱者皆可讀），不單靠顏色/箭頭。 */}
      <span className={cn('text-[11px]', directionClass)}>{directionText}</span>
    </div>
  );
}

export function EditImpactBar({ delta }: { delta: OrgHealthDelta }) {
  return (
    <section
      aria-label="本次調整的影響"
      className={cn(
        'rounded-lg border bg-card px-3 py-2 shadow-sm transition-opacity',
        !delta.hasChanges && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            本次調整的影響
          </span>
          {!delta.hasChanges && (
            <span className="text-xs text-muted-foreground">尚無變更</span>
          )}
        </div>
        {delta.metrics.map((metric) => (
          <MetricCell key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}
