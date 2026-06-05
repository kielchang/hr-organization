import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ApprovalThreshold } from '../../types/bpmn';
import type { JobLevel } from '../../types/org';
import { fmtAmount } from '../../services/bpmnSimulator';

interface Props {
  thresholds: ApprovalThreshold[];
  jobLevels: JobLevel[];
  onChange: (thresholds: ApprovalThreshold[]) => void;
  readonly?: boolean;
}

export function ApprovalThresholdEditor({ thresholds, jobLevels, onChange, readonly }: Props) {
  const sorted = [...jobLevels].sort((a, b) => a.rank - b.rank);

  function getMax(jlId: string) {
    return thresholds.find((t) => t.jobLevelId === jlId)?.maxApprovalAmount ?? 0;
  }

  function setMax(jlId: string, val: number) {
    const updated = thresholds.some((t) => t.jobLevelId === jlId)
      ? thresholds.map((t) => (t.jobLevelId === jlId ? { ...t, maxApprovalAmount: val } : t))
      : [...thresholds, { jobLevelId: jlId, maxApprovalAmount: val }];
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">設定每個職等可核准的最高金額（0 = 無核准權）</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((jl) => {
          const max = getMax(jl.id);
          return (
            <div key={jl.id} className="flex items-center gap-3 px-3 py-2">
              <div className="w-20 shrink-0">
                <Badge variant="outline" className="text-xs">{jl.name}</Badge>
              </div>
              <div className="text-[10px] text-muted-foreground w-6 shrink-0">rank {jl.rank}</div>
              {readonly ? (
                <span className="text-sm font-medium">
                  {max === 0 ? <span className="text-muted-foreground">無核准權</span> : fmtAmount(max)}
                </span>
              ) : (
                <Input
                  type="number"
                  min={0}
                  value={max}
                  onChange={(e) => setMax(jl.id, Number(e.target.value))}
                  className="h-7 w-36 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
