import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProcessHealth } from '../../../types/bpmn';

interface Props {
  health: ProcessHealth;
}

const modeLabel: Record<string, string> = {
  byJobLevel: '全公司職等',
  directSupervisor: '直屬主管',
  groupJobLevel: '同組職等',
  orgHierarchy: '組織追溯',
};

function HealthBadge({ severity }: { severity: ProcessHealth['severity'] }) {
  if (severity === 'critical')
    return (
      <Badge variant="destructive" className="text-[10px] gap-0.5">
        <AlertCircle className="size-3" />斷裂風險
      </Badge>
    );
  if (severity === 'warning')
    return (
      <Badge variant="warning" className="text-[10px] gap-0.5">
        <AlertTriangle className="size-3" />單點風險
      </Badge>
    );
  return (
    <Badge variant="success" className="text-[10px] gap-0.5">
      <CheckCircle2 className="size-3" />健康
    </Badge>
  );
}

export function ProcessHealthRow({ health }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasIssues = health.severity !== 'ok';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{health.processName}</p>
            <HealthBadge severity={health.severity} />
          </div>
          {hasIssues && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {health.nodes.filter((n) => n.severity === 'critical').length} 個斷裂節點
              {' · '}
              {health.nodes.filter((n) => n.severity === 'warning').length} 個單點風險節點
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {health.nodes.length} 個核准節點
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-3">
          {health.nodes.map((node) => (
            <div
              key={node.nodeId}
              className={`rounded-lg border p-3 text-xs space-y-2 ${
                node.severity === 'critical'
                  ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20'
                  : node.severity === 'warning'
                  ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{node.nodeLabel}</p>
                <Badge variant="outline" className="text-[9px]">{modeLabel[node.mode] ?? node.mode}</Badge>
                {node.severity === 'critical' && (
                  <Badge variant="destructive" className="text-[9px] gap-0.5">
                    <AlertCircle className="size-2.5" />{node.brokenRequesters.length} 人斷裂
                  </Badge>
                )}
                {node.severity === 'warning' && (
                  <Badge variant="warning" className="text-[9px] gap-0.5">
                    <AlertTriangle className="size-2.5" />{node.spofRequesters.length} 人單點
                  </Badge>
                )}
              </div>

              {node.brokenRequesters.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-destructive mb-1">找不到核准人（需修復）</p>
                  <div className="flex flex-wrap gap-1">
                    {node.brokenRequesters.map((r) => (
                      <span key={r.id} className="rounded bg-rose-100 text-rose-800 px-1.5 py-0.5">
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {node.spofRequesters.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-amber-700 mb-1">僅一位核准人（單點風險）</p>
                  <div className="flex flex-wrap gap-1">
                    {node.spofRequesters.map((r) => (
                      <span key={r.id} className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {node.severity === 'ok' && (
                <p className="text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  全部 {node.okScenarioCount} 個情境均有足夠核准人
                </p>
              )}
            </div>
          ))}

          {health.nodes.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">此流程無人工核准節點</p>
          )}
        </div>
      )}
    </div>
  );
}
