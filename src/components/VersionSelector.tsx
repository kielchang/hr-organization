import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { selectOptionLabel, toSelectOptions } from '@/lib/selectOptions';
import { buttonIntent, validationBadge } from '@/lib/uiSemantics';
import { useOrg } from '../context/useOrg';
import { effectiveStatus } from '../services/effectiveDate';
import type { DataVersionInfo } from '../services/dataVersions';

/** 版本標籤後綴：標示生效日狀態（排程中／已生效）。 */
function effectiveSuffix(v: DataVersionInfo): string {
  if (!v.effectiveDate) return '';
  const status = effectiveStatus({ id: v.id, publishedAt: v.exportedAt, effectiveDate: v.effectiveDate });
  return status === 'scheduled'
    ? `（排程 ${v.effectiveDate} 生效）`
    : `（${v.effectiveDate} 生效）`;
}

export function VersionSelector() {
  const {
    dataVersions,
    activeVersionId,
    selectDataVersion,
    activeVersion,
    deletePublishedVersion,
  } = useOrg();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const canDelete = activeVersion?.source === 'published';

  const versionOptions = useMemo(
    () =>
      toSelectOptions(
        dataVersions,
        activeVersionId,
        (v) => v.id,
        (v) => `${v.valid ? '✓ ' : '✗ '}${v.label}${effectiveSuffix(v)}`,
      ),
    [dataVersions, activeVersionId],
  );

  if (dataVersions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無可載入的資料版本</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="data-version" className="shrink-0 text-muted-foreground">
          資料版本
        </Label>
        <Select value={activeVersionId} onValueChange={(v) => v && selectDataVersion(v)}>
          <SelectTrigger id="data-version" className="min-w-[260px] bg-background">
            <SelectValue placeholder="選擇版本">
              {selectOptionLabel(versionOptions, activeVersionId)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versionOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeVersion && (
          <Badge variant={validationBadge(activeVersion.valid)}>
            {activeVersion.valid ? '驗證通過' : '驗證失敗'}
          </Badge>
        )}
        {canDelete && (
          <Button
            type="button"
            size="sm"
            variant={buttonIntent.danger}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="size-3.5" />
            刪除此版本
          </Button>
        )}
      </div>
      {activeVersion?.note && (
        <p className="text-sm text-muted-foreground">
          調整理由：{activeVersion.note}
        </p>
      )}
      {activeVersion && !activeVersion.valid && activeVersion.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-inside list-disc space-y-0.5">
              {activeVersion.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {activeVersion && (
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="刪除此發布版本？"
          description={`將永久移除「${activeVersion.label}」，此動作無法復原。內建版本不受影響。`}
          confirmLabel="確定刪除"
          cancelLabel="取消"
          danger
          onConfirm={() => deletePublishedVersion(activeVersionId)}
        />
      )}
    </div>
  );
}
