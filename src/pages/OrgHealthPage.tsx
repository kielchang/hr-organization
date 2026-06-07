import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  GaugeCircle,
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
import { FindingGroup } from '../components/orgHealth/FindingGroup';
import { useOrg } from '../context/useOrg';
import {
  buildOrgHealth,
  buildReadiness,
  type OrgHealthFinding,
  type ReadinessResult,
  type SpanEntry,
} from '../services/orgHealth';

/** R0.3 健檢分群固定順序（warning 為主的群優先）。 */
const CATEGORY_ORDER: ReadonlyArray<OrgHealthFinding['category']> = [
  'chain',
  'cycle',
  'spof',
  'span',
  'function',
  'depth',
];

/** R0.5 就緒度等級 → Badge variant 與中文標籤。 */
const readinessLevelMeta: Record<
  ReadinessResult['level'],
  { variant: 'success' | 'warning' | 'destructive'; label: string }
> = {
  high: { variant: 'success', label: '結構就緒' },
  medium: { variant: 'warning', label: '尚需補強' },
  low: { variant: 'destructive', label: '結構待整理' },
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

/** R0.5 規劃就緒度區塊：total 大數字 + level 徽章 + 四維度 + CM 註記。 */
function ReadinessSection({ readiness }: { readiness: ReadinessResult }) {
  const meta = readinessLevelMeta[readiness.level];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GaugeCircle className="size-4 text-muted-foreground" />
          規劃就緒度
        </CardTitle>
        <CardDescription>
          以結構面 finding 推導的快速訊號（管理幅度、結構完整性、職能覆蓋、關鍵人風險）
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-8">
        {/* 總分 + 等級徽章 */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-4xl font-semibold leading-none tracking-tight">
              {readiness.total}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">/ 100 分</span>
          </div>
          <Badge variant={meta.variant} className="self-start">
            {meta.label}
          </Badge>
        </div>

        {/* 四維度 */}
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {readiness.dimensions.map((d) => (
            <li key={d.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium tabular-nums">{d.score}</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={
                    d.score >= 80
                      ? 'h-full rounded-full bg-success'
                      : d.score >= 60
                        ? 'h-full rounded-full bg-warning'
                        : 'h-full rounded-full bg-destructive'
                  }
                  style={{ width: `${d.score}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardContent className="-mt-2">
        <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info-foreground">
          此為<strong className="font-semibold">結構面</strong>
          就緒度；完整的變革就緒（sponsor、溝通、抗拒管理）需搭配 stakeholder
          評估——見
          <Link
            to="/roadmap"
            className="mx-0.5 font-medium underline underline-offset-2"
          >
            改善 Roadmap
          </Link>
          Phase 1。
        </p>
      </CardContent>
    </Card>
  );
}

export function OrgHealthPage() {
  const { data } = useOrg();
  const health = useMemo(() => buildOrgHealth(data), [data]);
  const readiness = useMemo(() => buildReadiness(health), [health]);

  const { summary, span, depth, findings } = health;

  // R0.3 依固定 category 順序分群（空群不顯示）。
  const findingGroups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: findings.filter((f) => f.category === category),
      })).filter((g) => g.items.length > 0),
    [findings],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">規劃健檢</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          以目前編輯中的組織資料量化評估組織結構：管理幅度、層級深度、職能覆蓋缺口，以及懸空匯報／循環指派／無備援主管等結構風險，協助規劃決策。
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

      {/* R0.5 規劃就緒度（摘要卡下、findings 上） */}
      <ReadinessSection readiness={readiness} />

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
          {findingGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              未發現結構風險，目前組織結構健康。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {findingGroups.map((g) => (
                <FindingGroup
                  key={g.category}
                  category={g.category}
                  findings={g.items}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
