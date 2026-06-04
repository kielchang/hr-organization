import { Text } from '@fluentui/react-components';
import { OrgChartGroupSelector } from './OrgChartGroupSelector';
import type { Group } from '../../types/org';

export type OrgFlowChartVariant = 'reporting' | 'membership';

interface OrgFlowControlsProps {
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  mountNode?: HTMLElement | null;
}

export function OrgFlowControls({
  variant,
  selectedGroupId,
  onGroupChange,
  activeGroups,
  mountNode,
}: OrgFlowControlsProps) {
  const allGroupsLabel =
    variant === 'reporting' ? '全公司' : '全公司（各組並列）';

  return (
    <div
      className="org-flow-controls"
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
      <Text size={200} className="org-flow-legend">
        {variant === 'reporting' ? (
          <>
            <span className="legend-solid">━</span> 主匯報
            <span className="legend-dashed">┄</span> 虛線匯報
          </>
        ) : (
          <>
            每個節點為一筆組別歸屬；連線依該歸屬的主管設定。
            <br />
            <span className="legend-solid">━</span> 主主管
            <span className="legend-dashed">┄</span> 其他主管
          </>
        )}
      </Text>
    </div>
  );
}
