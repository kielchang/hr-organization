import { useState } from 'react';
import { Camera, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ImpactBaseline } from '../../../types/bpmn';
import type { DataVersionInfo } from '../../../services/dataVersions';

type BaselineSource = 'snapshot' | 'version';

interface Props {
  baseline: ImpactBaseline | null | undefined;
  dataVersions: DataVersionInfo[];
  selectedVersionId: string;
  onCapture: () => void;
  onClear: () => void;
  onSelectVersion: (id: string) => void;
  onSourceChange: (source: BaselineSource) => void;
  source: BaselineSource;
}

export function BaselineSelector({
  baseline,
  dataVersions,
  selectedVersionId,
  onCapture,
  onClear,
  onSelectVersion,
  onSourceChange,
  source,
}: Props) {
  const validVersions = dataVersions.filter((v) => v.valid);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">基準來源（Before）</p>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button
            onClick={() => onSourceChange('snapshot')}
            className={`px-3 py-1.5 transition-colors ${
              source === 'snapshot'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            捕捉快照
          </button>
          <button
            onClick={() => onSourceChange('version')}
            className={`px-3 py-1.5 border-l border-border transition-colors ${
              source === 'version'
                ? 'bg-primary text-primary-foreground'
                : 'bg-transparent text-muted-foreground hover:bg-muted'
            }`}
          >
            已存版本
          </button>
        </div>
      </div>

      {source === 'snapshot' ? (
        <div className="flex items-center gap-3">
          {baseline ? (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{baseline.label}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3" />
                  {new Date(baseline.capturedAt).toLocaleString('zh-TW')}
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {baseline.data.employees.filter((e) => e.status === 'active').length} 位員工
              </Badge>
              <Button variant="ghost" size="sm" onClick={onClear} className="shrink-0 text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">尚未建立快照——點擊按鈕擷取目前組織狀態</p>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={onCapture}>
                <Camera className="size-3.5" />建立基準快照
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {validVersions.length === 0 ? (
            <p className="text-xs text-muted-foreground">無可用版本（請先匯入 org-data JSON）</p>
          ) : (
            <Select value={selectedVersionId} onValueChange={onSelectVersion}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="選擇基準版本…" />
              </SelectTrigger>
              <SelectContent>
                {validVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    <span className="flex items-center gap-2">
                      {v.label}
                      {v.isSeed && <Badge variant="secondary" className="text-[9px]">種子</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-2">
        <span className="font-medium text-foreground">目標（After）：</span>
        目前組織資料（即時）
      </div>
    </div>
  );
}
