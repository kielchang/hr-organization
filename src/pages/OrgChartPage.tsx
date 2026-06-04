import {
  Text,
  Title2,
  Card,
  CardHeader,
  Badge,
  Tab,
  TabList,
} from '@fluentui/react-components';
import type { SelectTabData } from '@fluentui/react-components';
import { useMemo, useState } from 'react';
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  const employee = data.employees.find((e) => e.id === selectedEmployeeId);
  const allAssignments = useMemo(
    () =>
      data.assignments.filter((a) => a.employeeId === selectedEmployeeId),
    [data.assignments, selectedEmployeeId],
  );

  const onTabSelect = (_e: unknown, data: SelectTabData) => {
    const value = data.value as ChartMode;
    setChartMode(value);
    setSelectedEmployeeId(null);
  };

  return (
    <div className="org-chart-page">
      <Title2>組織圖</Title2>
      <TabList
        selectedValue={chartMode}
        onTabSelect={onTabSelect}
        className="org-chart-tabs"
      >
        <Tab value="reporting">匯報組織圖</Tab>
        <Tab value="membership">組別歸屬圖</Tab>
      </TabList>
      <Text block className="page-desc">
        {chartMode === 'reporting' ? (
          <>
            以人員為節點、依匯報關係連線；可選「全公司」或單一組別。僅顯示該視野內的員工，實線為主匯報、虛線為其他主管。
          </>
        ) : (
          <>
            以每筆「組別歸屬」為節點，連線僅依該歸屬紀錄的主管設定；同一人跨組會出現多個節點。主管不在此組時以「組外主管」顯示。
          </>
        )}
      </Text>
      <div className="org-chart-layout">
        {chartMode === 'reporting' ? (
          <OrgFlowChart
            selectedGroupId={groupId}
            onGroupChange={setGroupId}
            onNodeSelect={setSelectedEmployeeId}
          />
        ) : (
          <GroupMembershipFlowChart
            selectedGroupId={groupId}
            onGroupChange={setGroupId}
            onNodeSelect={setSelectedEmployeeId}
          />
        )}
        <aside className="org-chart-sidebar">
          <Title2 as="h3">人員詳情</Title2>
          {employee ? (
            <>
              <Text weight="semibold" block>
                {employee.name}（{employee.employeeNo}）
              </Text>
              <Text block size={200}>
                {chartMode === 'membership'
                  ? '以下為所有組別歸屬（點選節點對應其中一筆）'
                  : '以下為所有組別歸屬（矩陣全貌）'}
              </Text>
              {allAssignments.map((a) => {
                const group = data.groups.find((g) => g.id === a.groupId);
                const jl = data.jobLevels.find((j) => j.id === a.jobLevelId);
                return (
                  <Card key={a.id} className="sidebar-card">
                    <CardHeader
                      header={
                        <span>
                          {group?.name}
                          {a.isPrimaryGroup && (
                            <Badge appearance="outline" color="brand" size="small">
                              主組別
                            </Badge>
                          )}
                        </span>
                      }
                    />
                    <Text size={200}>職級：{jl?.name}</Text>
                    <Text size={200}>
                      主管：
                      {a.supervisorIds
                        .map((sid) => {
                          const s = data.employees.find((e) => e.id === sid);
                          const primary =
                            a.primarySupervisorId === sid ? '*' : '';
                          return s ? `${s.name}${primary}` : sid;
                        })
                        .join('、') || '—'}
                    </Text>
                  </Card>
                );
              })}
              {allAssignments.length === 0 && (
                <Text>此員工尚無組別歸屬</Text>
              )}
            </>
          ) : (
            <Text>點選組織圖節點以檢視詳情</Text>
          )}
        </aside>
      </div>
    </div>
  );
}
