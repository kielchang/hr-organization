import { useState } from 'react';
import { Clock, Eye, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { buttonIntent } from '@/lib/uiSemantics';
import type { EditSnapshot } from '../../types/editSession';
import { DiffLegend } from './DiffLegend';

interface SnapshotPanelProps {
  snapshots: EditSnapshot[];
  previewingSnapshotId: string | null;
  onPreview: (id: string | null) => void;
  onRollback: (id: string) => void;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SnapshotPanel({
  snapshots,
  previewingSnapshotId,
  onPreview,
  onRollback,
  onClose,
}: SnapshotPanelProps) {
  const [rollbackTargetId, setRollbackTargetId] = useState<string | null>(null);

  const reversed = [...snapshots].reverse();

  return (
    <>
      <div className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">快照清單</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {snapshots.length}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title="關閉快照清單"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto p-3">
          {reversed.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              尚無快照。點擊「儲存檢查點」來建立快照。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {reversed.map((snapshot, idx) => {
                const isPreviewing = previewingSnapshotId === snapshot.id;
                const isLatest = idx === 0;
                return (
                  <div
                    key={snapshot.id}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      isPreviewing
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-border bg-background hover:bg-muted/40',
                    )}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{snapshot.description}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatTimestamp(snapshot.timestamp)}
                        </p>
                      </div>
                      {isLatest && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          最新
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={isPreviewing ? buttonIntent.primary : buttonIntent.neutral}
                        className="h-7 flex-1 text-xs"
                        onClick={() => onPreview(isPreviewing ? null : snapshot.id)}
                      >
                        <Eye className="size-3" />
                        {isPreviewing ? '結束預覽' : '預覽差異'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={buttonIntent.neutral}
                        className="h-7 flex-1 text-xs"
                        onClick={() => setRollbackTargetId(snapshot.id)}
                      >
                        <RotateCcw className="size-3" />
                        回溯
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diff legend when previewing */}
        {previewingSnapshotId && (
          <div className="border-t border-border p-3">
            <DiffLegend />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={rollbackTargetId !== null}
        onOpenChange={(open) => { if (!open) setRollbackTargetId(null); }}
        title="回溯至此快照？"
        description="目前的草稿將替換為此快照的狀態，此快照之後的所有變更將遺失。此動作無法復原。"
        confirmLabel="確定回溯"
        cancelLabel="取消"
        danger
        onConfirm={() => {
          if (rollbackTargetId) onRollback(rollbackTargetId);
          setRollbackTargetId(null);
        }}
      />
    </>
  );
}
