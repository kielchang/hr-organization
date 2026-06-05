import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { BpmnFlowNode, BpmnFlowEdge, FlowCondition } from '../../types/bpmn';
import type { JobLevel } from '../../types/org';

interface Props {
  node: BpmnFlowNode | null;
  edge: BpmnFlowEdge | null;
  jobLevels: JobLevel[];
  onNodeChange: (n: BpmnFlowNode) => void;
  onEdgeChange: (e: BpmnFlowEdge) => void;
}

const OPERATORS: FlowCondition['operator'][] = ['<', '<=', '>', '>=', '==', '!='];

export function BpmnPropertiesPanel({ node, edge, jobLevels, onNodeChange, onEdgeChange }: Props) {
  const [condVar, setCondVar] = useState('amount');

  if (!node && !edge) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-4 text-center">
        點選節點或連線<br />以查看屬性
      </div>
    );
  }

  // ── Edge properties ──
  if (edge) {
    const cond = edge.condition;
    return (
      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">連線</p>
            <p className="mt-1 text-sm font-medium break-all">{edge.id}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">標籤</Label>
            <Input
              value={edge.label ?? ''}
              onChange={(e) => onEdgeChange({ ...edge, label: e.target.value })}
              className="h-7 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">條件（Gateway 出口）</Label>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">變數</Label>
              <Input
                value={cond?.variable ?? condVar}
                onChange={(e) => {
                  setCondVar(e.target.value);
                  onEdgeChange({
                    ...edge,
                    condition: { variable: e.target.value, operator: cond?.operator ?? '<', value: cond?.value ?? 0 },
                  });
                }}
                placeholder="amount"
                className="h-7 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">運算子</Label>
              <div className="flex flex-wrap gap-1">
                {OPERATORS.map((op) => (
                  <button
                    key={op}
                    onClick={() =>
                      onEdgeChange({
                        ...edge,
                        condition: { variable: cond?.variable ?? condVar, operator: op, value: cond?.value ?? 0 },
                      })
                    }
                    className={`rounded border px-2 py-0.5 text-xs ${
                      cond?.operator === op ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                    }`}
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
                onChange={(e) =>
                  onEdgeChange({
                    ...edge,
                    condition: { variable: cond?.variable ?? condVar, operator: cond?.operator ?? '<', value: Number(e.target.value) },
                  })
                }
                className="h-7 text-sm"
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // ── Node properties ──
  const isUserTask = node!.type === 'bpmnUserTask';
  const sorted = [...jobLevels].sort((a, b) => b.rank - a.rank);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div>
          <Badge variant="outline" className="text-[10px]">{node!.type}</Badge>
          <p className="mt-1 text-xs text-muted-foreground break-all">{node!.id}</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">節點名稱</Label>
          <Input
            value={node!.data.label}
            onChange={(e) =>
              onNodeChange({ ...node!, data: { ...node!.data, label: e.target.value } })
            }
            className="h-7 text-sm"
          />
        </div>

        {isUserTask && (
          <div className="space-y-2">
            <Label className="text-xs">可執行職等</Label>
            <div className="space-y-1 rounded-lg border border-border p-2">
              {sorted.map((jl) => {
                const ids = (node!.data.assigneeJobLevelIds as string[]) ?? [];
                const checked = ids.includes(jl.id);
                return (
                  <label key={jl.id} className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v ? [...ids, jl.id] : ids.filter((id) => id !== jl.id);
                        onNodeChange({
                          ...node!,
                          data: { ...node!.data, assigneeJobLevelIds: next },
                        });
                      }}
                    />
                    <span>{jl.name}</span>
                    <span className="text-muted-foreground">rank {jl.rank}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
