import { OrgChartGroupSelector } from './OrgChartGroupSelector';
import { OrgFlowLegendInfo } from './OrgFlowLegendInfo';
import type { OrgFlowChartVariant } from './OrgFlowControls';
import type { Group } from '../../types/org';

interface OrgFlowTopBarProps {
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  mountNode: HTMLElement | null;
}

/** 左上角：檢視組別（底線下拉）＋圖例驚嘆號 */
export function OrgFlowTopBar({
  variant,
  selectedGroupId,
  onGroupChange,
  activeGroups,
  mountNode,
}: OrgFlowTopBarProps) {
  const allGroupsLabel =
    variant === 'reporting' ? '全公司' : '全公司（各組並列）';

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm"
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
      <OrgFlowLegendInfo variant={variant} />
    </div>
  );
}
