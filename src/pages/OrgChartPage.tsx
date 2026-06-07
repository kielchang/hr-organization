import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import { OrgFlowChart } from '../components/orgFlow/OrgFlowChart';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { FunctionCoveragePanel } from '../components/groupMembership/FunctionCoveragePanel';
import { EditModeToolbar } from '../components/orgFlow/EditModeToolbar';
import { EditImpactBar } from '../components/orgFlow/EditImpactBar';
import { SnapshotPanel } from '../components/orgFlow/SnapshotPanel';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { useOrg } from '../context/useOrg';
import { useOrgFlowEditing } from '../hooks/useOrgFlowEditing';
import type { GroupKind } from '../types/org';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X } from 'lucide-react';

type ChartMode = 'reporting' | 'membership';
/** 組別歸屬視角的種類過濾：all=不過濾。 */
type MembershipKindFilter = 'all' | GroupKind;

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
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);

  const editing = useOrgFlowEditing();
  const {
    isEditMode,
    session,
    orgData,
    impactDelta,
    diffResult,
    staleDataWarning,
  } = editing;

  const resolvedGroupId = useMemo(
    () => resolveGroupId(groupId, orgData.groups),
    [groupId, orgData],
  );

  const handleEnterEditMode = () => {
    editing.enterEditMode();
  };

  const handleExitEditMode = () => {
    editing.exitEditMode();
    setShowSnapshotPanel(false);
  };

  const handleSaveCheckpoint = (description: string) => {
    editing.saveCheckpoint(description);
    setShowSnapshotPanel(true);
  };

  const handlePublish = (opts: {
    label?: string;
    note?: string;
    effectiveDate?: string;
  }) => {
    editing.publish(opts);
    setShowSnapshotPanel(false);
  };

  const chartProps = {
    selectedGroupId: resolvedGroupId,
    onGroupChange: setGroupId,
    selectedEmployeeId,
    onNodeSelect: setSelectedEmployeeId,
    isEditMode,
    orgData,
    diffResult,
    onDraftChange: editing.onDraftChange,
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">組織圖</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {chartDescriptions[chartMode]}
        </p>
      </header>

      {staleDataWarning && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>底層資料已在外部變更。建議捨棄目前草稿後重新進入編輯模式。</span>
            <button
              type="button"
              onClick={editing.dismissStaleWarning}
              className="shrink-0 text-amber-600 hover:text-amber-900"
            >
              <X className="size-4" />
            </button>
          </AlertDescription>
        </Alert>
      )}

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

      {/* Edit mode toolbar — only for reporting chart */}
      {chartMode === 'reporting' && (
        <EditModeToolbar
          isEditMode={isEditMode}
          session={session}
          showSnapshotPanel={showSnapshotPanel}
          onEnterEditMode={handleEnterEditMode}
          onExitEditMode={handleExitEditMode}
          onSaveCheckpoint={handleSaveCheckpoint}
          onPublish={handlePublish}
          onToggleSnapshotPanel={() => setShowSnapshotPanel((v) => !v)}
        />
      )}

      {/* 編輯態 before→after 指標浮層（R5.2）：僅匯報組織圖編輯模式顯示 */}
      {chartMode === 'reporting' &&
        isEditMode &&
        impactDelta && <EditImpactBar delta={impactDelta} />}

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

      {/* Chart area + optional snapshot panel */}
      <div className="flex min-h-0 gap-3" style={{ height: 'calc(100vh - 18rem)' }}>
        <div className="relative min-h-[480px] flex-1">
          {chartMode === 'reporting' ? (
            <OrgFlowChart variant="reporting" {...chartProps} />
          ) : (
            <GroupMembershipFlowChart variant="membership" {...{
              selectedGroupId: resolvedGroupId,
              onGroupChange: setGroupId,
              selectedEmployeeId,
              onNodeSelect: setSelectedEmployeeId,
              kindFilter: membershipKind === 'all' ? undefined : membershipKind,
            }} />
          )}
        </div>

        {chartMode === 'reporting' && isEditMode && showSnapshotPanel && session && (
          <SnapshotPanel
            snapshots={session.snapshots}
            previewingSnapshotId={session.previewingSnapshotId}
            onPreview={editing.previewSnapshot}
            onRollback={editing.rollbackToSnapshot}
            onClose={() => setShowSnapshotPanel(false)}
          />
        )}
      </div>

      {/* 職能視角輕量訊號：覆蓋缺口與跨職能負載（全部／職能過濾時顯示） */}
      {chartMode === 'membership' && membershipKind !== 'department' && (
        <FunctionCoveragePanel data={orgData} />
      )}
    </div>
  );
}
