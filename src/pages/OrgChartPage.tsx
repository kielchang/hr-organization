import { Title2, Text, Tab, TabList } from '@fluentui/react-components';
import type { SelectTabData } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { OrgFlowChart } from '../components/orgFlow/OrgFlowChart';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { useOrg } from '../context/useOrg';

type ChartMode = 'reporting' | 'membership';

function pickDefaultGroupId(groups: { id: string; status: string }[]): string {
  const active = groups.filter((g) => g.status === 'active');
  return (
    active.find((g) => g.id === 'g4')?.id ??
    active[0]?.id ??
    ALL_GROUPS_VIEW_ID
  );
}

function resolveGroupId(
  groupId: string,
  groups: { id: string; status: string }[],
): string {
  if (groupId === ALL_GROUPS_VIEW_ID) return ALL_GROUPS_VIEW_ID;
  const active = groups.filter((g) => g.status === 'active');
  if (active.some((g) => g.id === groupId)) return groupId;
  return pickDefaultGroupId(groups);
}

export function OrgChartPage() {
  const { data } = useOrg();

  const [chartMode, setChartMode] = useState<ChartMode>('reporting');
  const [groupId, setGroupId] = useState(() => pickDefaultGroupId(data.groups));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const resolvedGroupId = useMemo(
    () => resolveGroupId(groupId, data.groups),
    [groupId, data.groups],
  );

  const onTabSelect = (_e: unknown, tabData: SelectTabData) => {
    setChartMode(tabData.value as ChartMode);
    setSelectedEmployeeId(null);
  };

  const chartProps = {
    selectedGroupId: resolvedGroupId,
    onGroupChange: setGroupId,
    selectedEmployeeId,
    onNodeSelect: setSelectedEmployeeId,
  };

  return (
    <div className="org-chart-page">
      <Title2>組織圖</Title2>
      <TabList selectedValue={chartMode} onTabSelect={onTabSelect} className="org-chart-tabs">
        <Tab value="reporting">匯報組織圖</Tab>
        <Tab value="membership">組別歸屬圖</Tab>
      </TabList>
      <Text block className="page-desc">
        {chartMode === 'reporting' ? (
          <>以人員為節點、依匯報關係連線；可選「全公司」或單一組別。實線為主匯報、虛線為其他主管。</>
        ) : (
          <>以每筆「組別歸屬」為節點，連線依該歸屬的主管設定；同一人跨組會出現多個節點。</>
        )}
      </Text>
      <div className="org-chart-layout">
        {chartMode === 'reporting' ? (
          <OrgFlowChart variant="reporting" {...chartProps} />
        ) : (
          <GroupMembershipFlowChart variant="membership" {...chartProps} />
        )}
      </div>
    </div>
  );
}
