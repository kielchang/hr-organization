import { Title2, Text, Tab, TabList } from '@fluentui/react-components';
import type { SelectTabData } from '@fluentui/react-components';
import { useState } from 'react';
import { OrgFlowChart } from '../components/orgFlow/OrgFlowChart';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { useOrg } from '../context/OrgContext';

type ChartMode = 'reporting' | 'membership';

export function OrgChartPage() {
  const { data } = useOrg();
  const defaultGroup =
    data.groups.find((g) => g.status === 'active' && g.id === 'g4')?.id ??
    data.groups.find((g) => g.status === 'active')?.id ??
    '';
  const [chartMode, setChartMode] = useState<ChartMode>('reporting');
  const [groupId, setGroupId] = useState(defaultGroup);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const onTabSelect = (_e: unknown, data: SelectTabData) => {
    setChartMode(data.value as ChartMode);
    setSelectedEmployeeId(null);
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
          <OrgFlowChart
            selectedGroupId={groupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
          />
        ) : (
          <GroupMembershipFlowChart
            selectedGroupId={groupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
          />
        )}
      </div>
    </div>
  );
}
