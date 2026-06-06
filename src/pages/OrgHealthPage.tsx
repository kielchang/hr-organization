import { useMemo } from 'react';
import {
  AlertTriangle,
  Info,
  Layers,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FunctionCoveragePanel } from '../components/groupMembership/FunctionCoveragePanel';
import { useOrg } from '../context/useOrg';
import {
  buildOrgHealth,
  type OrgHealthFinding,
  type SpanEntry,
} from '../services/orgHealth';

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
  chain: '斷鏈',
  cycle: '匯報循環',
  spof: '單點風險',
};

/** 摘要卡片。 */
function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            tone === 'warning' && Number(value) > 0
              ? 'text-2xl text-warning-foreground'
              : 'text-2xl'
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="-mt-2 text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

/** 管理幅度清單（過寬／過窄）。 */
function SpanList({
  title,
  emptyText,
  entries,
  badgeVariant,
}: {
  title: string;
  emptyText: string;
  entries: SpanEntry[];
  badgeVariant: 'warning' | 'info';
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li
              key={e.supervisor.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate">{e.supervisor.name}</span>
              <Badge variant={badgeVariant}>{e.directReports} 名部屬</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrgHealthPage() {
  const { data } = useOrg();
  const health = useMemo(() => buildOrgHealth(data), [data]);

  const { summary, span, depth, findings } = health;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">規劃健檢</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          以目前編輯中的組織資料量化評估組織結構：管理幅度、層級深度、職能覆蓋缺口，以及斷鏈／循環／單點等結構風險，協助規劃決策。
        </p>
      </header>

      {/* 1. 摘要卡片列 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="在職人數" value={summary.activeEmployees} />
        <SummaryCard label="部門數" value={summary.departments} />
        <SummaryCard label="職能數" value={summary.functions} />
        <SummaryCard label="主管數" value={summary.supervisors} />
        <SummaryCard
          label="平均管理幅度"
          value={summary.avgSpan.toFixed(1)}
          hint="有部屬的主管平均"
        />
        <SummaryCard
          label="警示數"
          value={summary.warningCount}
          tone="warning"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. 管理幅度 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              管理幅度（span of control）
            </CardTitle>
            <CardDescription>
              依主匯報線計：平均 {span.average.toFixed(1)}、最多 {span.max}、最少{' '}
              {span.min}（{span.supervisorCount} 名主管）
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SpanList
              title="過寬（部屬過多）"
              emptyText="無管理幅度過寬的主管"
              entries={span.wide}
              badgeVariant="warning"
            />
            <SpanList
              title="過窄（僅 1 名部屬）"
              emptyText="無僅單一部屬的主管"
              entries={span.narrow}
              badgeVariant="info"
            />
          </CardContent>
        </Card>

        {/* 3. 層級深度 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              層級深度（depth）
            </CardTitle>
            <CardDescription>
              依各員工主歸屬之組內匯報層級（非全組織縱深）；最大深度{' '}
              {depth.maxDepth}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {depth.perLevel.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無層級資料。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>層級</TableHead>
                    <TableHead className="text-right">人數</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depth.perLevel.map((p) => (
                    <TableRow key={p.level}>
                      <TableCell>第 {p.level} 層</TableCell>
                      <TableCell className="text-right">{p.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. 職能覆蓋（重用既有面板） */}
      <FunctionCoveragePanel data={data} />

      {/* 5. 結構風險 / 警示清單 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" />
            結構風險 / 警示清單
          </CardTitle>
          <CardDescription>
            共 {findings.length} 筆訊號（警示 {summary.warningCount} 筆）
          </CardDescription>
        </CardHeader>
        <CardContent>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              未發現結構風險，目前組織結構健康。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm ring-1 ring-foreground/5"
                >
                  {f.severity === 'warning' ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-info-foreground" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-foreground">{f.message}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={severityBadgeVariant(f.severity)}>
                        {severityLabel[f.severity]}
                      </Badge>
                      <Badge variant="outline">{categoryLabel[f.category]}</Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
