import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OrgFlowChart } from '../components/orgFlow/OrgFlowChart';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { FunctionCoveragePanel } from '../components/groupMembership/FunctionCoveragePanel';
import { EditModeToolbar } from '../components/orgFlow/EditModeToolbar';
import { EditImpactBar } from '../components/orgFlow/EditImpactBar';
import { SnapshotPanel } from '../components/orgFlow/SnapshotPanel';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { computeOrgDiff } from '../services/computeOrgDiff';
import { buildHealthDelta, buildOrgHealth } from '../services/orgHealth';
import { useOrg } from '../context/useOrg';
import { useEditSession } from '../hooks/useEditSession';
import { cloneOrgData } from '../services/exportImport';
import type { GroupKind, OrgData } from '../types/org';
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
  const { data, publishVersion } = useOrg();

  const [chartMode, setChartMode] = useState<ChartMode>('reporting');
  const [membershipKind, setMembershipKind] =
    useState<MembershipKindFilter>('all');
  const [groupId, setGroupId] = useState(() => pickDefaultGroupId(data.groups));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);
  const [staleDataWarning, setStaleDataWarning] = useState(false);

  const editSession = useEditSession();
  const prevPublishedRef = useRef<OrgData>(data);

  // Detect if published data changes while in edit mode
  useEffect(() => {
    if (editSession.isEditMode && data !== prevPublishedRef.current) {
      setStaleDataWarning(true);
    }
    prevPublishedRef.current = data;
  }, [data, editSession.isEditMode]);

  const resolvedGroupId = useMemo(
    () => {
      const sourceData = editSession.isEditMode && editSession.session
        ? editSession.session.draftData
        : data;
      return resolveGroupId(groupId, sourceData.groups);
    },
    [groupId, data, editSession.isEditMode, editSession.session],
  );

  // The data source depends on mode
  const orgData = useMemo((): OrgData => {
    if (editSession.isEditMode && editSession.session) {
      return editSession.session.draftData;
    }
    return data;
  }, [data, editSession.isEditMode, editSession.session]);

  // Compute diff result when previewing a snapshot:
  // Compare original base data (when edit mode was entered) vs the previewed snapshot,
  // so users can see what changed from the original state to that checkpoint.
  const diffResult = useMemo(() => {
    if (!editSession.session?.previewingSnapshotId || !editSession.session) return null;
    const snapshot = editSession.session.snapshots.find(
      (s) => s.id === editSession.session!.previewingSnapshotId,
    );
    if (!snapshot) return null;
    return computeOrgDiff(editSession.session.baseData, snapshot.orgData);
  }, [editSession.session]);

  // 編輯態 before→after 指標（R5.2）：以進編輯前快照 vs 當前草稿比較。
  // 效能：base 端 health 在整個編輯 session 內不變（baseData 穩定），故獨立 memo
  // 在 [baseData]，避免每次草稿 mutate 都連 base 一起重算 buildOrgHealth/buildReadiness。
  const baseHealth = useMemo(() => {
    if (!editSession.isEditMode || !editSession.session) return null;
    return buildOrgHealth(editSession.session.baseData);
    // 刻意只依賴 baseData（session 內穩定）：依賴整個 session 會在每次草稿 mutate
    // 時白白重算 base 端，違背此優化目的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSession.isEditMode, editSession.session?.baseData]);

  // draft 端 health：僅在草稿資料變動時重算。
  const draftHealth = useMemo(() => {
    if (!editSession.isEditMode || !editSession.session) return null;
    return buildOrgHealth(editSession.session.draftData);
    // 刻意只依賴 draftData，避免被 session 其他欄位（如快照、預覽狀態）變動牽連重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSession.isEditMode, editSession.session?.draftData]);

  // 注意：此 useMemo 僅以 isEditMode 把關，不含 chartMode 限制；
  // 「只在匯報組織圖顯示」由下方 JSX 的 chartMode === 'reporting' 條件負責。
  const impactDelta = useMemo(() => {
    if (!baseHealth || !draftHealth) return null;
    return buildHealthDelta(baseHealth, draftHealth);
  }, [baseHealth, draftHealth]);

  const handleEnterEditMode = () => {
    editSession.enterEditMode(data);
    setStaleDataWarning(false);
  };

  const handleExitEditMode = () => {
    editSession.exitEditMode();
    setShowSnapshotPanel(false);
    setStaleDataWarning(false);
  };

  const handleSaveCheckpoint = (description: string) => {
    editSession.saveCheckpoint(description);
    setShowSnapshotPanel(true);
  };

  const handlePublish = (opts: {
    label?: string;
    note?: string;
    effectiveDate?: string;
  }) => {
    const draft = editSession.getDraftData();
    if (!draft) return;
    publishVersion(cloneOrgData(draft), opts);
    editSession.exitEditMode();
    setShowSnapshotPanel(false);
    setStaleDataWarning(false);
  };

  const handleDraftChange = (next: OrgData) => {
    editSession.mutateDraft(() => next);
  };

  const chartProps = {
    selectedGroupId: resolvedGroupId,
    onGroupChange: setGroupId,
    selectedEmployeeId,
    onNodeSelect: setSelectedEmployeeId,
    isEditMode: editSession.isEditMode,
    orgData,
    diffResult,
    onDraftChange: handleDraftChange,
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
              onClick={() => setStaleDataWarning(false)}
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
          isEditMode={editSession.isEditMode}
          session={editSession.session}
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
        editSession.isEditMode &&
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

        {chartMode === 'reporting' && editSession.isEditMode && showSnapshotPanel && editSession.session && (
          <SnapshotPanel
            snapshots={editSession.session.snapshots}
            previewingSnapshotId={editSession.session.previewingSnapshotId}
            onPreview={editSession.previewSnapshot}
            onRollback={editSession.rollbackToSnapshot}
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
