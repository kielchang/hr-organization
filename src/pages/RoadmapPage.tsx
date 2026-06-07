import { useMemo } from 'react';
import { AlertTriangle, HelpCircle, Map as MapIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  countByStatus,
  getRoadmapData,
  groupItemsByPhase,
  type RoadmapItem,
  type RoadmapItemSource,
  type RoadmapItemStatus,
  type RoadmapItemSize,
} from '../services/roadmap';

/** 來源徽章顏色（契約 §3.3）。 */
const SOURCE_STYLE: Record<
  RoadmapItemSource,
  { label: string; variant: 'info' | 'success' | 'warning' | 'default' }
> = {
  pm: { label: 'PM', variant: 'info' },
  uxr: { label: 'UXR', variant: 'success' },
  cm: { label: 'CM', variant: 'warning' },
  consensus: { label: '共識', variant: 'default' },
};

/** 狀態徽章顏色（契約 §3.3）。 */
const STATUS_STYLE: Record<
  RoadmapItemStatus,
  { label: string; variant: 'success' | 'default' | 'muted' | 'warning' | 'info' }
> = {
  done: { label: '已完成', variant: 'success' },
  'in-progress': { label: '進行中', variant: 'default' },
  planned: { label: '已排程', variant: 'muted' },
  researching: { label: '待訪談', variant: 'warning' },
  observing: { label: '觀察中', variant: 'info' },
};

/** size 徽章（沿用 outline 中性樣式，僅作為輔助標籤）。 */
const SIZE_LABEL: Record<RoadmapItemSize, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

export function RoadmapPage() {
  const data = useMemo(() => getRoadmapData(), []);
  const counts = useMemo(() => countByStatus(data), [data]);
  const grouped = useMemo(() => groupItemsByPhase(data), [data]);

  return (
    <div className="flex flex-col gap-8">
      {/* 1. 頁首 */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sidebar-primary">
          <MapIcon className="size-5" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-wider">
            改善 Roadmap
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          綜合 PM、UXR、變革管理顧問三方評審後的改善方向，與每次更新的進度
        </h2>
        <p className="text-xs text-muted-foreground">
          最後更新：{data.lastUpdated}
        </p>
      </header>

      {/* 2. 狀態總覽橫條 */}
      <section
        aria-label="狀態總覽"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard label="已完成" value={counts.done} tone="success" />
        <StatCard label="進行中" value={counts.inProgress} tone="primary" />
        <StatCard label="已排程" value={counts.planned} tone="muted" />
        <StatCard label="待訪談" value={counts.researching} tone="warning" />
        <StatCard label="觀察中" value={counts.observing} tone="info" />
        <StatCard label="合計" value={counts.total} tone="neutral" />
      </section>

      {/* 3. vibe 警告 callout（CM 顧問核心警告） */}
      <Callout tone="warning" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />}>
        <p className="text-sm font-semibold text-foreground">
          「工具讓 HR 變強，但讓 HR 高估自己」
        </p>
        <p className="text-sm text-muted-foreground">
          這是變革管理顧問對本工具最重要的 vibe 警告——HR
          常在 30% 完成度時以為自己在 90%。本 roadmap 的 Phase 0
          優先處理 vibe 校準，把 CM 思維注入核心流程（發布前提問、詞彙去工程化、保留事項、Readiness Score），其餘 phase 才依序展開。
        </p>
      </Callout>

      {/* 4. 依 phase 分組 */}
      <section aria-label="Roadmap 階段" className="flex flex-col gap-4">
        {grouped.map(({ phase, items }) => {
          if (items.length === 0) return null;
          const phaseStatus = STATUS_STYLE[phase.status];
          return (
            <Card key={phase.id}>
              <CardHeader className="border-b">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span>{phase.title}</span>
                  <Badge variant={phaseStatus.variant}>{phaseStatus.label}</Badge>
                  <span className="text-xs font-normal text-muted-foreground">
                    （{items.length} 項）
                  </span>
                </CardTitle>
                <CardDescription>{phase.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-3">
                {items.map((item) => (
                  <RoadmapItemRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* 5. 紅線清單 */}
      <Callout
        tone="destructive"
        icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />}
      >
        <p className="text-sm font-semibold text-foreground">紅線——三方共識「不該做」</p>
        <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
          {data.redLines.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      </Callout>

      {/* 6. 訪談驗證問題 */}
      <Callout tone="info" icon={<HelpCircle className="size-4 shrink-0" aria-hidden="true" />}>
        <p className="text-sm font-semibold text-foreground">
          訪談真實 HR 才能驗證的 8 個關鍵問題
        </p>
        <p className="text-sm text-muted-foreground">
          標記為「待訪談」的項目強烈建議先訪談 3–5 位真實 HR 再動。問題如下：
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
          {data.validationQuestions.map((q, idx) => (
            <li key={idx}>{q}</li>
          ))}
        </ol>
      </Callout>
    </div>
  );
}

/* ───────────────────────────── 子元件 ───────────────────────────── */

interface StatCardProps {
  label: string;
  value: number;
  tone: 'success' | 'primary' | 'muted' | 'warning' | 'info' | 'neutral';
}

const STAT_TONE_CLASS: Record<StatCardProps['tone'], string> = {
  success: 'text-success',
  primary: 'text-sidebar-primary',
  muted: 'text-muted-foreground',
  warning: 'text-warning-foreground',
  info: 'text-info-foreground',
  neutral: 'text-foreground',
};

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl ${STAT_TONE_CLASS[tone]}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

interface CalloutProps {
  tone: 'warning' | 'info' | 'destructive';
  icon: React.ReactNode;
  children: React.ReactNode;
}

const CALLOUT_TONE_CLASS: Record<CalloutProps['tone'], string> = {
  warning: 'border-warning/30 bg-warning/10',
  info: 'border-info/30 bg-info/10',
  destructive: 'border-destructive/30 bg-destructive/10',
};

const CALLOUT_ICON_TONE: Record<CalloutProps['tone'], string> = {
  warning: 'text-warning-foreground',
  info: 'text-info-foreground',
  destructive: 'text-destructive',
};

function Callout({ tone, icon, children }: CalloutProps) {
  return (
    <div
      className={`flex gap-3 rounded-lg border px-4 py-3 ${CALLOUT_TONE_CLASS[tone]}`}
      role="note"
    >
      <span className={`mt-0.5 ${CALLOUT_ICON_TONE[tone]}`}>{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function RoadmapItemRow({ item }: { item: RoadmapItem }) {
  const status = STATUS_STYLE[item.status];
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
        <span className="text-sm font-medium text-foreground">{item.title}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
        <Badge variant="outline" title={`規模：${item.size}`}>
          {SIZE_LABEL[item.size]}
        </Badge>
        {item.sources.map((src) => {
          const style = SOURCE_STYLE[src];
          return (
            <Badge key={src} variant={style.variant}>
              {style.label}
            </Badge>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{item.description}</p>
      {item.dependencies && item.dependencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          → 依賴：{item.dependencies.join('、')}
        </p>
      )}
      {item.notes && (
        <p className="text-xs text-muted-foreground italic">{item.notes}</p>
      )}
      {item.status === 'done' && (item.commitHash || item.completedAt) && (
        <p className="text-xs text-muted-foreground">
          {item.commitHash && (
            <>
              commit{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                {item.commitHash}
              </code>
            </>
          )}
          {item.commitHash && item.completedAt && <span> · </span>}
          {item.completedAt && <>完成於 {item.completedAt}</>}
        </p>
      )}
    </div>
  );
}
