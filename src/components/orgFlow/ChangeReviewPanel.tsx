import { useMemo } from 'react';
import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { changeTypeLabel } from '@/lib/changeTypeLabels';
import {
  computeFieldDiff,
  diffChangeEntryFields,
  sessionChangeEntries,
  type EntityFieldDiff,
  type FieldChange,
} from '../../services/computeFieldDiff';
import type { OrgData } from '../../types/org';

interface ChangeReviewPanelProps {
  /** 進入編輯時的已發布快照。 */
  base: OrgData;
  /** 目前草稿。 */
  draft: OrgData;
  onClose: () => void;
}

const kindMeta: Record<
  EntityFieldDiff['kind'],
  { label: string; badgeClass: string }
> = {
  added: {
    label: '新增',
    badgeClass: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  },
  removed: {
    label: '移除',
    badgeClass: 'border-red-300 bg-red-100 text-red-800',
  },
  modified: {
    label: '變更',
    badgeClass: 'border-amber-300 bg-amber-100 text-amber-800',
  },
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
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

/** 一列「欄位名：前值 → 後值」。 */
function FieldChangeRow({ change }: { change: FieldChange }) {
  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{change.label}</span>
      <span className="min-w-0 flex-1 break-words text-muted-foreground line-through decoration-muted-foreground/40">
        {change.before}
      </span>
      <ArrowRight
        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 break-words font-medium text-foreground">
        {change.after}
      </span>
    </div>
  );
}

export function ChangeReviewPanel({ base, draft, onClose }: ChangeReviewPanelProps) {
  const fieldDiff = useMemo(() => computeFieldDiff(base, draft), [base, draft]);
  const changeEntries = useMemo(
    () => sessionChangeEntries(base, draft),
    [base, draft],
  );

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">異動歷程</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="關閉異動歷程"
        >
          <X className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="compare" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border px-3 py-2">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="compare">前後對比</TabsTrigger>
            <TabsTrigger value="log">操作流水</TabsTrigger>
          </TabsList>
        </div>

        {/* 前後對比 */}
        <TabsContent
          value="compare"
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {fieldDiff.totalEntities === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              尚無異動。
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                本次共 <span className="font-medium text-foreground">{fieldDiff.totalEntities}</span> 項異動、
                <span className="font-medium text-foreground">{fieldDiff.totalFieldChanges}</span> 個欄位變更
              </p>
              <div className="flex flex-col gap-2">
                {fieldDiff.entries.map((entry) => {
                  const meta = kindMeta[entry.kind];
                  return (
                    <div
                      key={`${entry.type}-${entry.id}`}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-words text-sm font-medium">
                          {entry.title}
                        </p>
                        <Badge
                          className={cn(
                            'shrink-0 hover:bg-transparent',
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </Badge>
                      </div>
                      {entry.fields.length > 0 && (
                        <div className="mt-1 divide-y divide-border/60">
                          {entry.fields.map((field) => (
                            <FieldChangeRow key={field.key} change={field} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* 操作流水 */}
        <TabsContent
          value="log"
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {changeEntries.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              尚無操作紀錄。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {changeEntries.map((entry) => {
                const fields = diffChangeEntryFields(entry, base, draft);
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {changeTypeLabel(entry.changeType)}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <p className="break-words text-sm">{entry.summary}</p>
                    {fields.length > 0 && (
                      <div className="mt-1.5 divide-y divide-border/60 border-t border-border/60 pt-1">
                        {fields.map((field) => (
                          <FieldChangeRow key={field.key} change={field} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
