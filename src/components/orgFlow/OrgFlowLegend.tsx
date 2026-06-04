import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import type { OrgFlowChartVariant } from './OrgFlowControls';

interface OrgFlowLegendProps {
  variant: OrgFlowChartVariant;
}

function LegendLine({ dashed }: { dashed?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-0.5 w-5 shrink-0 rounded-full bg-foreground',
        dashed && 'h-0 border-b-2 border-dashed border-foreground bg-transparent',
      )}
      aria-hidden
    />
  );
}

export function OrgFlowLegend({ variant }: OrgFlowLegendProps) {
  if (variant === 'reporting') {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <LegendLine />
          主匯報
        </span>
        <span className="inline-flex items-center gap-2">
          <LegendLine dashed />
          虛線匯報
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <p className="leading-relaxed">
        每個節點為一筆組別歸屬；連線依該歸屬的主管設定。
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-2">
          <LegendLine />
          主主管
        </span>
        <span className="inline-flex items-center gap-2">
          <LegendLine dashed />
          其他主管
        </span>
      </div>
    </div>
  );
}

export function OrgFlowLegendBlock({ variant }: OrgFlowLegendProps) {
  return (
    <>
      <Separator className="my-3" />
      <OrgFlowLegend variant={variant} />
    </>
  );
}
