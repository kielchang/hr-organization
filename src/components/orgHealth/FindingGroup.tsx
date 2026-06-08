import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OrgHealthFinding } from '../../services/orgHealth';

/** finding severity → Badge variant（沿用既有語意色）。 */
function severityBadgeVariant(
  severity: OrgHealthFinding['severity'],
): 'warning' | 'info' {
  return severity === 'warning' ? 'warning' : 'info';
}

const severityLabel: Record<OrgHealthFinding['severity'], string> = {
  warning: '警示',
  info: '提示',
};

const categoryLabel: Record<OrgHealthFinding['category'], string> = {
  span: '管理幅度',
  depth: '層級深度',
  function: '職能覆蓋',
  chain: '懸空匯報',
  cycle: '匯報循環',
  spof: '無備援主管',
  'group-mismatch': '組別歸屬',
  'parallel-colead': '平行共管',
};

/** R0.3 單一 category 的可摺疊群（原生 details/summary，鍵盤可及）。 */
export function FindingGroup({
  category,
  findings,
}: {
  category: OrgHealthFinding['category'];
  findings: OrgHealthFinding[];
}) {
  // 群內 warning 在前、info 在後（穩定排序）。
  const sorted = [...findings].sort((a, b) => {
    const rank = (s: OrgHealthFinding['severity']) =>
      s === 'warning' ? 0 : 1;
    return rank(a.severity) - rank(b.severity);
  });
  const hasWarning = sorted.some((f) => f.severity === 'warning');

  return (
    <details open className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [details:not([open])_&]:-rotate-90" />
        <span>{categoryLabel[category]}</span>
        {hasWarning && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-destructive"
            aria-label="包含警示"
          />
        )}
        <Badge variant="muted" className="ml-auto">
          {sorted.length}
        </Badge>
      </summary>
      <ul className="flex flex-col gap-2 px-3 pb-3 pt-1">
        {sorted.map((f) => (
          <li
            key={f.id}
            className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm ring-1 ring-foreground/5"
          >
            {f.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-info-foreground" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-foreground">{f.message}</span>
              <Badge
                variant={severityBadgeVariant(f.severity)}
                className="self-start"
              >
                {severityLabel[f.severity]}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
