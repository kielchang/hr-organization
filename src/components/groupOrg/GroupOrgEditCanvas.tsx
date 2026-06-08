import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GroupOrgFlowChart } from './GroupOrgFlowChart';
import { EditModeToolbar } from '../orgFlow/EditModeToolbar';
import { EditImpactBar } from '../orgFlow/EditImpactBar';
import { SnapshotPanel } from '../orgFlow/SnapshotPanel';
import { ChangeReviewPanel } from '../orgFlow/ChangeReviewPanel';
import type { UseOrgFlowEditing } from '../../hooks/useOrgFlowEditing';

interface GroupOrgEditCanvasProps {
  /** 編輯 session 編排（useOrgFlowEditing 回傳值；與 reporting 視圖共用同一 session）。 */
  editing: UseOrgFlowEditing;
  /** 目前選定組別（已 resolve 過的有效值）。 */
  resolvedGroupId: string;
  /** 使用者切換檢視組別。 */
  onGroupChange: (groupId: string) => void;
  /** 目前選定員工節點（lift 至頁面，供右側面板等取用）。 */
  selectedEmployeeId: string | null;
  /** 員工節點選取變更。 */
  onNodeSelect: (employeeId: string | null) => void;
  /** 畫布高度的 inline style（與 reporting 版面一致）。 */
  heightStyle?: React.CSSProperties;
  /** 畫布右側額外面板（如工作台的即時面板），與快照面板並列於同一 flex 列。 */
  asidePanel?: ReactNode;
}

/**
 * 組別為主組織圖的「編輯版面」包裝——與 {@link ReportingEditCanvas} 同一套編輯 chrome
 * 與面板開合邏輯，僅中央畫布換為 {@link GroupOrgFlowChart}（組別為主、拖曳雙手勢改主管/改組）。
 *
 * 收斂內容（與 ReportingEditCanvas 一致）：staleWarning Alert ＋ EditModeToolbar ＋
 * 編輯態 EditImpactBar ＋ 中央畫布 ＋ 快照面板，以及面板開合（showSnapshotPanel）與
 * enter/exit/save/publish 時的面板重置邏輯。
 *
 * 邊界：群組選擇狀態（groupId）與選定員工狀態由頁面自管並 lift 傳入——與 reporting 視圖
 * 共用同一份 groupId / selectedEmployeeId / 編輯 session（同一 draft，兩視圖編輯同一份）。
 */
export function GroupOrgEditCanvas({
  editing,
  resolvedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
  heightStyle = { height: 'calc(100vh - 18rem)' },
  asidePanel,
}: GroupOrgEditCanvasProps) {
  const { isEditMode, session, impactDelta, diffResult, staleDataWarning, orgData } =
    editing;

  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);
  const [showChangeReviewPanel, setShowChangeReviewPanel] = useState(false);

  const handleEnterEditMode = () => {
    editing.enterEditMode();
  };

  const handleExitEditMode = () => {
    editing.exitEditMode();
    setShowSnapshotPanel(false);
    setShowChangeReviewPanel(false);
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
    setShowChangeReviewPanel(false);
  };

  return (
    <>
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
        showChangeReviewPanel={showChangeReviewPanel}
        onToggleChangeReviewPanel={() => setShowChangeReviewPanel((v) => !v)}
      />

      {/* 編輯態 before→after 指標浮層 */}
      {isEditMode && impactDelta && <EditImpactBar delta={impactDelta} />}

      {/* 中央畫布 + 選用快照面板（＋ 呼叫端可傳入的右側面板） */}
      <div className="flex min-h-0 gap-3" style={heightStyle}>
        <div className="relative min-h-[480px] flex-1">
          <GroupOrgFlowChart
            selectedGroupId={resolvedGroupId}
            onGroupChange={onGroupChange}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={onNodeSelect}
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

        {isEditMode && showChangeReviewPanel && session && (
          <ChangeReviewPanel
            base={session.baseData}
            draft={session.draftData}
            onClose={() => setShowChangeReviewPanel(false)}
          />
        )}

        {asidePanel}
      </div>
    </>
  );
}
