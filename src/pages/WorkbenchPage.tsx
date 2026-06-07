import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OrgFlowChart } from '../components/orgFlow/OrgFlowChart';
import { EditModeToolbar } from '../components/orgFlow/EditModeToolbar';
import { EditImpactBar } from '../components/orgFlow/EditImpactBar';
import { SnapshotPanel } from '../components/orgFlow/SnapshotPanel';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { useOrgFlowEditing } from '../hooks/useOrgFlowEditing';

function pickDefaultGroupId(groups: { id: string; status: string }[]): string {
  const active = groups.filter((g) => g.status === 'active');
  return active.find((g) => g.id === 'g4')?.id ?? active[0]?.id ?? ALL_GROUPS_VIEW_ID;
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

/**
 * 組織圖工作台（/workbench）—— 整合性主介面的容器。
 *
 * 階段 1（地基）：與 /org-chart 的「匯報組織圖」reporting 編輯能力等價，
 * 但獨立成頁，作為後續階段疊加即時面板（findings／職能／readiness）與
 * drag-to-reassign 的容器。編輯 session 編排與 /org-chart 共用 useOrgFlowEditing。
 */
export function WorkbenchPage() {
  const editing = useOrgFlowEditing();
  const {
    isEditMode,
    session,
    orgData,
    impactDelta,
    diffResult,
    staleDataWarning,
  } = editing;

  const [groupId, setGroupId] = useState(() => pickDefaultGroupId(orgData.groups));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">組織圖工作台</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          以組織圖拖拉為中心的整合工作區：在同一畫面進編輯、調整匯報關係、儲存檢查點與發布。
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

      {/* 編輯態 before→after 指標浮層（R5.2） */}
      {isEditMode && impactDelta && <EditImpactBar delta={impactDelta} />}

      {/* 中央畫布 + 選用快照面板 */}
      <div className="flex min-h-0 gap-3" style={{ height: 'calc(100vh - 18rem)' }}>
        <div className="relative min-h-[480px] flex-1">
          <OrgFlowChart
            variant="reporting"
            selectedGroupId={resolvedGroupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
            isEditMode={isEditMode}
            orgData={orgData}
            diffResult={diffResult}
            onDraftChange={editing.onDraftChange}
          />
        </div>

        {isEditMode && showSnapshotPanel && session && (
          <SnapshotPanel
            snapshots={session.snapshots}
            previewingSnapshotId={session.previewingSnapshotId}
            onPreview={editing.previewSnapshot}
            onRollback={editing.rollbackToSnapshot}
            onClose={() => setShowSnapshotPanel(false)}
          />
        )}
      </div>
    </div>
  );
}
