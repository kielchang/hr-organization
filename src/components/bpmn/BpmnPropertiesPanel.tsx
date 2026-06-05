import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BpmnFlowNode, BpmnFlowEdge, FlowCondition, ApproverResolutionMode, ApproverResolutionConfig } from '../../types/bpmn';
import type { JobLevel } from '../../types/org';

interface Props {
  node: BpmnFlowNode | null;
  edge: BpmnFlowEdge | null;
  jobLevels: JobLevel[];
  onNodeChange: (n: BpmnFlowNode) => void;
  onEdgeChange: (e: BpmnFlowEdge) => void;
}

const OPERATORS: FlowCondition['operator'][] = ['<', '<=', '>', '>=', '==', '!='];

const RESOLUTION_MODES: { value: ApproverResolutionMode; label: string; desc: string }[] = [
  { value: 'byJobLevel', label: '全公司職等', desc: '任何符合職等的在職員工' },
  { value: 'directSupervisor', label: '直屬主管', desc: '申請人的 primarySupervisorId' },
  { value: 'groupJobLevel', label: '同組職等', desc: '申請人所在組 × 指定職等' },
  { value: 'orgHierarchy', label: '組織追溯', desc: '向上追溯至 rank ≥ 最低值' },
];

const CONDITION_VAR_HINTS = [
  { value: 'amount', label: '金額 (amount)' },
  { value: 'category', label: '類別 (category)' },
  { value: 'requesterJobLevelRank', label: '申請人職等 rank' },
  { value: 'requesterGroupId', label: '申請人所在組 ID' },
  { value: 'requesterLevel', label: '申請人匯報層深度' },
];

export function BpmnPropertiesPanel({ node, edge, jobLevels, onNodeChange, onEdgeChange }: Props) {
  const [condVar, setCondVar] = useState('amount');

  if (!node && !edge) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        點選節點或連線<br />以查看屬性
      </div>
    );
  }

  // ── Edge ──────────────────────────────────────────────────────────────────
  if (edge) {
    const cond = edge.condition;
    return (
      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">連線</p>
            <p className="mt-1 break-all text-sm font-medium">{edge.id}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">標籤</Label>
            <Input value={edge.label ?? ''} onChange={(e) => onEdgeChange({ ...edge, label: e.target.value })} className="h-7 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">閘道條件</Label>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">變數</Label>
              <Select
                value={cond?.variable ?? condVar}
                onValueChange={(v) => {
                  setCondVar(v);
                  onEdgeChange({ ...edge, condition: { variable: v, operator: cond?.operator ?? '<', value: cond?.value ?? 0 } });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_VAR_HINTS.map((h) => (
                    <SelectItem key={h.value} value={h.value} className="text-xs">{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">運算子</Label>
              <div className="flex flex-wrap gap-1">
                {OPERATORS.map((op) => (
                  <button
                    key={op}
                    onClick={() => onEdgeChange({ ...edge, condition: { variable: cond?.variable ?? condVar, operator: op, value: cond?.value ?? 0 } })}
                    className={`rounded border px-2 py-0.5 text-xs ${cond?.operator === op ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">值</Label>
              <Input
                type="number"
                value={String(cond?.value ?? '')}
                onChange={(e) => onEdgeChange({ ...edge, condition: { variable: cond?.variable ?? condVar, operator: cond?.operator ?? '<', value: Number(e.target.value) } })}
                className="h-7 text-sm"
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // ── Node ──────────────────────────────────────────────────────────────────
  const isUserTask = node!.type === 'bpmnUserTask';
  const sorted = [...jobLevels].sort((a, b) => b.rank - a.rank);
  const resolution = node!.data.approverResolution as ApproverResolutionConfig | undefined;
  const currentMode: ApproverResolutionMode = resolution?.mode ?? 'byJobLevel';

  function setResolution(patch: Partial<ApproverResolutionConfig>) {
    const current = (node!.data.approverResolution as ApproverResolutionConfig | undefined) ?? { mode: 'byJobLevel' };
    onNodeChange({ ...node!, data: { ...node!.data, approverResolution: { ...current, ...patch } } });
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div>
          <Badge variant="outline" className="text-[10px]">{node!.type}</Badge>
          <p className="mt-1 break-all text-xs text-muted-foreground">{node!.id}</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">節點名稱</Label>
          <Input
            value={node!.data.label}
            onChange={(e) => onNodeChange({ ...node!, data: { ...node!.data, label: e.target.value } })}
            className="h-7 text-sm"
          />
        </div>

        {isUserTask && (
          <>
            {/* 核准人解析策略 */}
            <div className="space-y-2">
              <Label className="text-xs">核准人解析策略</Label>
              <Select value={currentMode} onValueChange={(v) => setResolution({ mode: v as ApproverResolutionMode })}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      <span className="font-medium">{m.label}</span>
                      <span className="ml-1 text-muted-foreground">— {m.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* byJobLevel / groupJobLevel：職等多選 */}
              {(currentMode === 'byJobLevel' || currentMode === 'groupJobLevel') && (
                <div className="space-y-1 rounded-lg border border-border p-2">
                  <p className="text-[11px] text-muted-foreground">可核准職等</p>
                  {sorted.map((jl) => {
                    const ids = (resolution?.jobLevelIds ?? (node!.data.assigneeJobLevelIds as string[]) ?? []);
                    const checked = ids.includes(jl.id);
                    return (
                      <label key={jl.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = v ? [...ids, jl.id] : ids.filter((id) => id !== jl.id);
                            setResolution({ jobLevelIds: next });
                            onNodeChange({ ...node!, data: { ...node!.data, assigneeJobLevelIds: next } });
                          }}
                        />
                        <span>{jl.name}</span>
                        <span className="text-muted-foreground">rank {jl.rank}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* orgHierarchy：最低 rank */}
              {currentMode === 'orgHierarchy' && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">最低可核准 rank</Label>
                  <Input
                    type="number"
                    min={1}
                    value={resolution?.minJobLevelRank ?? 30}
                    onChange={(e) => setResolution({ minJobLevelRank: Number(e.target.value) })}
                    className="h-7 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">（副理 30 / 經理 40 / 總監 50）</p>
                </div>
              )}

              {/* fallback */}
              {currentMode !== 'byJobLevel' && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">找不到時備援</Label>
                  <Select
                    value={resolution?.fallback ?? 'none'}
                    onValueChange={(v) => setResolution({ fallback: v === 'none' ? undefined : v as 'byJobLevel' | 'orgHierarchy' })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">無備援</SelectItem>
                      <SelectItem value="byJobLevel" className="text-xs">全公司職等</SelectItem>
                      <SelectItem value="orgHierarchy" className="text-xs">組織追溯</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
