import { useState } from 'react';
import { Pencil, Eye, Save, Upload, Trash2, History, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onPublish: (effectiveDate?: string) => void;
  onToggleSnapshotPanel: () => void;
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
}: EditModeToolbarProps) {
  const [showCheckpointInput, setShowCheckpointInput] = useState(false);
  const [checkpointDesc, setCheckpointDesc] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState('');

  const snapshotCount = session?.snapshots.length ?? 0;

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
        onOpenChange={setShowPublishConfirm}
        title="發布異動？"
        description="將目前的草稿發布為一個新的版本（以發布時間命名），儲存至本機並可在「資料版本」中切換。"
        confirmLabel="確定發布"
        cancelLabel="取消"
        onConfirm={() => onPublish(effectiveDate || undefined)}
      >
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
      </ConfirmDialog>
    </>
  );
}
