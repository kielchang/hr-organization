/**
 * @deprecated 已併入 /workbench 第 3 視角「組別歸屬圖」，`/org-chart` 路由改為導向 /workbench，
 * 本檔不再被路由引用、暫保留備援以降風險，未來可由獨立 PR 移除。
 */
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { FunctionCoveragePanel } from '../components/groupMembership/FunctionCoveragePanel';
import { ReportingEditCanvas } from '../components/orgFlow/ReportingEditCanvas';
import {
  pickDefaultGroupId,
  resolveGroupId,
} from '../components/orgFlow/orgFlowGroupSelection';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { useOrg } from '../context/useOrg';
import { useOrgFlowEditing } from '../hooks/useOrgFlowEditing';
import type { GroupKind } from '../types/org';

type ChartMode = 'reporting' | 'membership';
/** 組別歸屬視角的種類過濾：all=不過濾。 */
type MembershipKindFilter = 'all' | GroupKind;

const chartDescriptions: Record<ChartMode, string> = {
  reporting:
    '以人員為節點、依匯報關係連線；可選「全公司」或單一組別。實線為主匯報、虛線為其他主管。',
  membership:
    '以每筆「組別歸屬」為節點，連線依該歸屬的主管設定；同一人跨組會出現多個節點。',
};

export function OrgChartPage() {
  const { data } = useOrg();

  const [chartMode, setChartMode] = useState<ChartMode>('reporting');
  const [membershipKind, setMembershipKind] =
    useState<MembershipKindFilter>('all');
  const [groupId, setGroupId] = useState(() => pickDefaultGroupId(data.groups));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const editing = useOrgFlowEditing();
  const { orgData } = editing;

  const resolvedGroupId = useMemo(
    () => resolveGroupId(groupId, orgData.groups),
    [groupId, orgData],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">組織圖</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {chartDescriptions[chartMode]}
        </p>
      </header>

      <Tabs
        value={chartMode}
        onValueChange={(value) => {
          setChartMode(value as ChartMode);
          setSelectedEmployeeId(null);
        }}
      >
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="reporting">匯報組織圖</TabsTrigger>
          <TabsTrigger value="membership">組別歸屬圖</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 組別歸屬視角：種類過濾切換（全部／部門／職能） */}
      {chartMode === 'membership' && (
        <Tabs
          value={membershipKind}
          onValueChange={(value) => {
            const nextKind = value as MembershipKindFilter;
            setMembershipKind(nextKind);
            setSelectedEmployeeId(null);
            // 若目前選定的單組種類與新過濾不符，會渲染成空白畫面；自動切回「全部視角」。
            if (nextKind !== 'all' && resolvedGroupId !== ALL_GROUPS_VIEW_ID) {
              const selectedGroup = orgData.groups.find(
                (g) => g.id === resolvedGroupId,
              );
              if (selectedGroup && selectedGroup.kind !== nextKind) {
                setGroupId(ALL_GROUPS_VIEW_ID);
              }
            }
          }}
        >
          <TabsList variant="default" className="w-fit">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="department">部門</TabsTrigger>
            <TabsTrigger value="function">職能</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {chartMode === 'reporting' ? (
        <ReportingEditCanvas
          editing={editing}
          resolvedGroupId={resolvedGroupId}
          onGroupChange={setGroupId}
          selectedEmployeeId={selectedEmployeeId}
          onNodeSelect={setSelectedEmployeeId}
        />
      ) : (
        <div className="flex min-h-0 gap-3" style={{ height: 'calc(100vh - 18rem)' }}>
          <div className="relative min-h-[480px] flex-1">
            <GroupMembershipFlowChart
              variant="membership"
              selectedGroupId={resolvedGroupId}
              onGroupChange={setGroupId}
              selectedEmployeeId={selectedEmployeeId}
              onNodeSelect={setSelectedEmployeeId}
              kindFilter={membershipKind === 'all' ? undefined : membershipKind}
            />
          </div>
        </div>
      )}

      {/* 職能視角輕量訊號：覆蓋缺口與跨職能負載（全部／職能過濾時顯示） */}
      {chartMode === 'membership' && membershipKind !== 'department' && (
        <FunctionCoveragePanel data={orgData} />
      )}
    </div>
  );
}
