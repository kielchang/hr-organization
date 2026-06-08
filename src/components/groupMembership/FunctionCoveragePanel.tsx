import { useMemo } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buildFunctionCoverage } from '../../services/functionCoverage';
import type { OrgData } from '../../types/org';

interface FunctionCoveragePanelProps {
  data: OrgData;
}

/** 顯示前幾名的跨職能負載人數上限。 */
const TOP_LOAD_LIMIT = 5;

/**
 * 職能視角的輕量訊號區塊（非整頁）：覆蓋缺口（無成員／無 lead）與跨職能負載前幾名。
 * 資料一律由 `buildFunctionCoverage` 純函式計算。
 */
export function FunctionCoveragePanel({ data }: FunctionCoveragePanelProps) {
  const coverage = useMemo(() => buildFunctionCoverage(data), [data]);

  const topLoad = coverage.crossFunctionLoad
    .filter((l) => l.functionCount > 1)
    .slice(0, TOP_LOAD_LIMIT);

  const hasFunctions = coverage.functions.length > 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-foreground/5">
      <header className="mb-3 flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">職能覆蓋訊號</h3>
        <span className="text-xs text-muted-foreground">
          共 {coverage.functions.length} 個職能
        </span>
      </header>

      {!hasFunctions ? (
        <p className="text-sm text-muted-foreground">
          尚未標記任何職能。可於「組別管理」將跨部門組別的種類設為「職能」。
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <CoverageColumn
            title="無成員的職能"
            tone="warning"
            emptyText="所有職能皆有成員"
            items={coverage.functionsWithoutMembers.map((g) => g.name)}
          />
          <CoverageColumn
            title="無 lead 的職能"
            tone="warning"
            emptyText="所有職能皆有 lead"
            items={coverage.functionsWithoutLead.map((g) => g.name)}
          />
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              跨職能負載前 {TOP_LOAD_LIMIT} 名
            </h4>
            {topLoad.length === 0 ? (
              <p className="text-xs text-muted-foreground">無人同時隸屬多個職能</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {topLoad.map((l) => (
                  <li
                    key={l.employee.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate" title={l.functionNames.join('、')}>
                      {l.employee.name}
                    </span>
                    <Badge variant="info">{l.functionCount} 職能</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface CoverageColumnProps {
  title: string;
  tone: 'warning';
  emptyText: string;
  items: string[];
}

function CoverageColumn({ title, emptyText, items }: CoverageColumnProps) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((name) => (
            <li key={name} className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
