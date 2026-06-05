import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProcessImpact, ScenarioImpact } from '../../../types/bpmn';

interface Props {
  impact: ProcessImpact;
}

function SeverityBadge({ severity }: { severity: ProcessImpact['severity'] }) {
  if (severity === 'critical')
    return <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="size-3" />嚴重</Badge>;
  if (severity === 'high')
    return <Badge variant="warning" className="text-[10px]">高</Badge>;
  if (severity === 'medium')
    return <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">中</Badge>;
  return <Badge variant="secondary" className="text-[10px]">無影響</Badge>;
}

/** Aggregate node approver changes across all scenarios, keyed by nodeId */
function aggregateNodeChanges(
  scenarios: ScenarioImpact[],
): Map<string, {
  nodeLabel: string;
  becameBroken: boolean;
  before: { id: string; name: string }[];
  after: { id: string; name: string }[];
  affectedRequesters: { id: string; name: string }[];
}> {
  const map = new Map<string, {
    nodeLabel: string;
    becameBroken: boolean;
    before: { id: string; name: string }[];
    after: { id: string; name: string }[];
    requesterIds: Set<string>;
    affectedRequesters: { id: string; name: string }[];
  }>();

  for (const si of scenarios) {
    for (const nc of si.nodeApproverChanges) {
      if (!map.has(nc.nodeId)) {
        map.set(nc.nodeId, {
          nodeLabel: nc.nodeLabel,
          becameBroken: nc.becameBroken,
          before: nc.before,
          after: nc.after,
          requesterIds: new Set([si.scenario.requesterId]),
          affectedRequesters: [{ id: si.scenario.requesterId, name: si.scenario.requesterName }],
        });
      } else {
        const entry = map.get(nc.nodeId)!;
        entry.becameBroken = entry.becameBroken || nc.becameBroken;
        if (!entry.requesterIds.has(si.scenario.requesterId)) {
          entry.requesterIds.add(si.scenario.requesterId);
          entry.affectedRequesters.push({ id: si.scenario.requesterId, name: si.scenario.requesterName });
        }
      }
    }
  }

  return map;
}

/** Unique path changes across all affected scenarios */
function uniquePathChanges(
  scenarios: ScenarioImpact[],
): { before: string[]; after: string[]; requesters: string[] }[] {
  const byKey = new Map<string, { before: string[]; after: string[]; requesters: string[] }>();

  for (const si of scenarios.filter((s) => s.pathChanged)) {
    const key = `${si.pathBeforeLabels.join('>')}|${si.pathAfterLabels.join('>')}`;
    if (!byKey.has(key)) {
      byKey.set(key, { before: si.pathBeforeLabels, after: si.pathAfterLabels, requesters: [si.scenario.requesterName] });
    } else {
      byKey.get(key)!.requesters.push(si.scenario.requesterName);
    }
  }

  return [...byKey.values()];
}

export function ProcessImpactRow({ impact }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (impact.severity === 'none') return null;

  const nodeChanges = aggregateNodeChanges(impact.affectedScenarios);
  const pathChanges = uniquePathChanges(impact.affectedScenarios);

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
            <p className="font-medium text-sm">{impact.processName}</p>
            <SeverityBadge severity={impact.severity} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {impact.affectedNodeIds.length} 個節點異動 · 波及 {impact.affectedRequesterIds.length} 位申請人
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-4">

          {/* Path changes */}
          {pathChanges.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">路徑變動</p>
              {pathChanges.map((pc, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1.5">
                  <p className="text-muted-foreground">影響：{pc.requesters.slice(0, 5).join('、')}{pc.requesters.length > 5 ? ` 等 ${pc.requesters.length} 人` : ''}</p>
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <span className="text-muted-foreground shrink-0 w-8">前：</span>
                      <span className="flex flex-wrap gap-1">
                        {pc.before.map((label, j) => (
                          <span key={j} className="flex items-center gap-0.5">
                            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5">{label}</span>
                            {j < pc.before.length - 1 && <ArrowRight className="size-2.5 text-muted-foreground" />}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-muted-foreground shrink-0 w-8">後：</span>
                      <span className="flex flex-wrap gap-1">
                        {pc.after.map((label, j) => (
                          <span key={j} className="flex items-center gap-0.5">
                            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800">{label}</span>
                            {j < pc.after.length - 1 && <ArrowRight className="size-2.5 text-muted-foreground" />}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Node approver changes */}
          {nodeChanges.size > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">核准人異動節點</p>
              {[...nodeChanges.entries()].map(([nodeId, nc]) => (
                <div
                  key={nodeId}
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    nc.becameBroken
                      ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{nc.nodeLabel}</p>
                    {nc.becameBroken && (
                      <Badge variant="destructive" className="text-[10px] gap-0.5">
                        <AlertTriangle className="size-2.5" />無人可核
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      影響：{nc.affectedRequesters.slice(0, 5).map((r) => r.name).join('、')}
                      {nc.affectedRequesters.length > 5 ? ` 等 ${nc.affectedRequesters.length} 人` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">調整前</p>
                      {nc.before.length === 0 ? (
                        <span className="text-muted-foreground italic">無</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {nc.before.map((p) => (
                            <span key={p.id} className="rounded bg-muted px-1.5 py-0.5">{p.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1">調整後</p>
                      {nc.after.length === 0 ? (
                        <span className="font-medium text-destructive">（無人可核）</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {nc.after.map((p) => (
                            <span key={p.id} className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">{p.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
