import { useState } from 'react';
import {
  Pencil,
  Eye,
  Save,
  Upload,
  Trash2,
  History,
  Check,
  Lightbulb,
  GitCompareArrows,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { buttonIntent } from '@/lib/uiSemantics';
import type { EditSession } from '../../types/editSession';

interface EditModeToolbarProps {
  isEditMode: boolean;
  session: EditSession | null;
  showSnapshotPanel: boolean;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onSaveCheckpoint: (description: string) => void;
  onPublish: (opts: {
    label?: string;
    note?: string;
    effectiveDate?: string;
  }) => void;
  onToggleSnapshotPanel: () => void;
  /** 異動歷程面板是否開啟（選填；未傳則不顯示該切換鈕）。 */
  showChangeReviewPanel?: boolean;
  /** 切換異動歷程面板（選填；未傳則不顯示該切換鈕）。 */
  onToggleChangeReviewPanel?: () => void;
}

export function EditModeToolbar({
  isEditMode,
  session,
  showSnapshotPanel,
  onEnterEditMode,
  onExitEditMode,
  onSaveCheckpoint,
  onPublish,
  onToggleSnapshotPanel,
  showChangeReviewPanel = false,
  onToggleChangeReviewPanel,
}: EditModeToolbarProps) {
  const [showCheckpointInput, setShowCheckpointInput] = useState(false);
  const [checkpointDesc, setCheckpointDesc] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');

  // R0.1 變革管理 nudge：三個選填問題（純前端 state，不持久化、不送後端）。
  const [sponsor, setSponsor] = useState('');
  const [affectedPeople, setAffectedPeople] = useState('');
  const [sustainmentOwner, setSustainmentOwner] = useState('');

  const snapshotCount = session?.snapshots.length ?? 0;

  // 任一題空白即顯示柔性提醒（nudge，不阻擋發布）。
  const showChangeNudge =
    !sponsor.trim() || !affectedPeople.trim() || !sustainmentOwner.trim();

  // 對話框關閉後重置版本名稱/理由與三題 state（不影響發布行為）。
  const handlePublishDialogChange = (open: boolean) => {
    setShowPublishConfirm(open);
    if (!open) {
      setVersionLabel('');
      setVersionNote('');
      setSponsor('');
      setAffectedPeople('');
      setSustainmentOwner('');
    }
  };

  const handleSaveCheckpoint = () => {
    if (!checkpointDesc.trim()) return;
    onSaveCheckpoint(checkpointDesc.trim());
    setCheckpointDesc('');
    setShowCheckpointInput(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 shadow-sm">
        {/* Mode badge */}
        {isEditMode ? (
          <Badge className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Pencil className="mr-1 size-3" />
            編輯模式
          </Badge>
        ) : (
          <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <Eye className="mr-1 size-3" />
            檢視模式
          </Badge>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        {!isEditMode ? (
          <Button
            type="button"
            size="sm"
            variant={buttonIntent.edit}
            onClick={onEnterEditMode}
          >
            <Pencil className="size-3.5" />
            進入編輯
          </Button>
        ) : (
          <>
            {/* Save checkpoint */}
            {showCheckpointInput ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  className="h-8 w-48 text-sm"
                  placeholder="輸入檢查點說明…"
                  value={checkpointDesc}
                  onChange={(e) => setCheckpointDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCheckpoint();
                    if (e.key === 'Escape') {
                      setShowCheckpointInput(false);
                      setCheckpointDesc('');
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant={buttonIntent.primary}
                  onClick={handleSaveCheckpoint}
                  disabled={!checkpointDesc.trim()}
                >
                  <Check className="size-3.5" />
                  確認
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={buttonIntent.neutral}
                  onClick={() => {
                    setShowCheckpointInput(false);
                    setCheckpointDesc('');
                  }}
                >
                  取消
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={buttonIntent.neutral}
                onClick={() => setShowCheckpointInput(true)}
              >
                <Save className="size-3.5" />
                儲存檢查點
              </Button>
            )}

            {/* Snapshot panel toggle */}
            {snapshotCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant={showSnapshotPanel ? buttonIntent.primary : buttonIntent.neutral}
                onClick={onToggleSnapshotPanel}
              >
                <History className="size-3.5" />
                快照清單
                <Badge className="ml-1 h-4 w-4 justify-center p-0 text-[10px]">
                  {snapshotCount}
                </Badge>
              </Button>
            )}

            {/* Change review panel toggle */}
            {onToggleChangeReviewPanel && (
              <Button
                type="button"
                size="sm"
                variant={
                  showChangeReviewPanel ? buttonIntent.primary : buttonIntent.neutral
                }
                onClick={onToggleChangeReviewPanel}
              >
                <GitCompareArrows className="size-3.5" />
                異動歷程
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Discard */}
              <Button
                type="button"
                size="sm"
                variant={buttonIntent.danger}
                onClick={() => setShowExitConfirm(true)}
              >
                <Trash2 className="size-3.5" />
                捨棄
              </Button>

              {/* Publish */}
              <Button
                type="button"
                size="sm"
                variant={buttonIntent.primary}
                onClick={() => setShowPublishConfirm(true)}
              >
                <Upload className="size-3.5" />
                發布
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showExitConfirm}
        onOpenChange={setShowExitConfirm}
        title="捨棄編輯？"
        description="目前的編輯變更（包含所有未發布的快照）將全部捨棄，此動作無法復原。"
        confirmLabel="確定捨棄"
        cancelLabel="繼續編輯"
        danger
        onConfirm={onExitEditMode}
      />

      <ConfirmDialog
        open={showPublishConfirm}
        onOpenChange={handlePublishDialogChange}
        title="發布異動？"
        description="將目前的草稿發布為一個新的版本（以發布時間命名），儲存至本機並可在「資料版本」中切換。"
        confirmLabel="確定發布"
        cancelLabel="取消"
        onConfirm={() =>
          onPublish({
            label: versionLabel.trim() || undefined,
            note: versionNote.trim() || undefined,
            effectiveDate: effectiveDate || undefined,
          })
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="publish-version-label" className="text-sm text-muted-foreground">
              版本名稱（選填，留空＝以發布時間命名）
            </label>
            <Input
              id="publish-version-label"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="例：2026 上半年組織調整案"
              className="w-full"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="publish-version-note" className="text-sm text-muted-foreground">
              這次調整的理由（選填）
            </label>
            <Textarea
              id="publish-version-note"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="例：強化跨部門協作、整併重疊職能"
              className="w-full"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="publish-effective-date" className="text-sm text-muted-foreground">
              生效日（選填，留空＝發布即生效）
            </label>
            <Input
              id="publish-effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full"
            />
          </div>

          {/* R0.1 變革管理三問（選填，不送後端、不影響發布） */}
          <div className="grid gap-3 border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">
              發布前，先想想「人的一面」
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                （皆選填）
              </span>
            </p>

            <div className="grid gap-1.5">
              <label
                htmlFor="publish-sponsor"
                className="text-sm text-muted-foreground"
              >
                這次調整的 sponsor（高層支持者）是誰？
              </label>
              <Input
                id="publish-sponsor"
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                placeholder="例：營運副總 王小明"
                className="w-full"
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="publish-affected"
                className="text-sm text-muted-foreground"
              >
                主要受影響的關鍵人員／單位有哪些？
              </label>
              <Textarea
                id="publish-affected"
                value={affectedPeople}
                onChange={(e) => setAffectedPeople(e.target.value)}
                placeholder="例：業務一部全體、原採購主管"
                className="w-full"
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="publish-owner"
                className="text-sm text-muted-foreground"
              >
                落地後的追蹤負責人（sustainment owner）是誰？
              </label>
              <Input
                id="publish-owner"
                value={sustainmentOwner}
                onChange={(e) => setSustainmentOwner(e.target.value)}
                placeholder="例：HRBP 李小華"
                className="w-full"
              />
            </div>

            {showChangeNudge && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                <Lightbulb
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  組織調整的成敗多半取決於「人的一面」。建議先想清楚
                  sponsor、受影響者、追蹤人——但你仍可直接發布。
                </p>
              </div>
            )}
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
