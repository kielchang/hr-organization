import { cn } from '@/lib/utils';
import { OrgChartGroupSelector } from './OrgChartGroupSelector';
import { OrgFlowLegendBlock } from './OrgFlowLegend';
import type { Group } from '../../types/org';

export type OrgFlowChartVariant = 'reporting' | 'membership';

interface OrgFlowControlsProps {
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  mountNode?: HTMLElement | null;
  className?: string;
}

export function OrgFlowControls({
  variant,
  selectedGroupId,
  onGroupChange,
  activeGroups,
  mountNode,
  className,
}: OrgFlowControlsProps) {
  const allGroupsLabel =
    variant === 'reporting' ? '全公司' : '全公司（各組並列）';

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-0 border-b border-border/60 bg-transparent px-4 py-3.5',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <OrgChartGroupSelector
        selectedGroupId={selectedGroupId}
        onGroupChange={onGroupChange}
        activeGroups={activeGroups}
        allGroupsLabel={allGroupsLabel}
        mountNode={mountNode}
      />
      <OrgFlowLegendBlock variant={variant} />
    </div>
  );
}
