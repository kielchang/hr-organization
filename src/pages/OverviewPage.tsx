import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CircleDashed,
  Compass,
  FileSpreadsheet,
  Activity,
  GitCompare,
  Send,
  TriangleAlert,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOrg } from '../context/useOrg';
import { useBpmn } from '../context/useBpmn';
import {
  buildOverviewStatus,
  type OverviewStepKey,
} from '../services/overviewStatus';
import { loadPublishedVersions } from '../services/publishedVersions';

/** 6 步旅程的圖示對應（與 services/overviewStatus.ts 的 key 對齊）。 */
const STEP_ICON: Record<OverviewStepKey, typeof Users> = {
  load: FileSpreadsheet,
  edit: Users,
  health: Activity,
  compare: GitCompare,
  impact: TriangleAlert,
  publish: Send,
};

export function OverviewPage() {
  const { data, dataVersions } = useOrg();
  const { store } = useBpmn();
  const navigate = useNavigate();

  // 契約 §3：publishedVersionsCount 語意為「本機發布版本數」，不可把雲端後端版本
  // （apiVersionToInfo 也把 source 標為 'published'）算進去，否則首次使用者只要
  // 後端有版本就會被推薦邏輯跳過引導步驟。直接從 localStorage 讀本機發布清單；
  // dataVersions 變動代表 OrgProvider 重新 loadAllVersions（含發布動作），用它當
  // 重算訊號讓計數隨發布即時更新。
  const publishedVersionsCount = useMemo(
    () => loadPublishedVersions().length,
    // dataVersions 不在 body 內讀取，但它是「OrgProvider 重新載入版本清單」的訊號
    // （含發布／匯入發布版本後 setDataVersions），用它強制重算 localStorage 計數。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataVersions],
  );

  const status = useMemo(() => {
    return buildOverviewStatus({
      data,
      publishedVersionsCount,
      processesCount: store.processes.length,
      impactBaselineSet: store.impactBaseline != null,
    });
  }, [data, publishedVersionsCount, store.processes.length, store.impactBaseline]);

  const { steps, recommendation, stats } = status;

  // 「沒資料」時把後續步驟視覺淡化（契約 §3 簡化說明）。
  const noData = stats.activeEmployees === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. 歡迎標題 */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sidebar-primary">
          <Compass className="size-5" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-wider">
            HR 組織規劃
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          以匯報線 × 專案職能雙維度規劃組織
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          量化評估、比較方案、看變更影響——從現況載入到發布版本，一條清楚的規劃旅程。
        </p>
      </header>

      {/* 2. 智慧 CTA 卡片 */}
      <Card className="border-sidebar-primary/30 bg-sidebar-primary/5">
        <CardHeader>
          <CardDescription>建議的下一步</CardDescription>
          <CardTitle className="text-xl">{recommendation.message}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            根據目前資料狀態自動推薦。你也可以從下方旅程地圖任選一步直接開始。
          </p>
          <Button
            variant="brand"
            onClick={() => navigate(recommendation.to)}
            aria-label={`前往：${recommendation.message}`}
          >
            立即開始
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>

      {/* 3. 規劃旅程地圖 */}
      <section
        aria-label="規劃旅程地圖"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold tracking-tight">規劃旅程</h3>
          <p className="text-xs text-muted-foreground">
            六步固定順序：載入 → 編輯 → 健檢 → 比較 → 影響 → 發布
          </p>
        </div>
        <ol
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          // 旅程是線性順序，視覺上的「連線」靠每格左/上 border 暗示，
          // 不再額外畫絕對定位的視覺線，避免 RWD/換行時錯位。
        >
          {steps.map((step, idx) => {
            const Icon = STEP_ICON[step.key];
            const isDone = step.status === 'done';
            // 「無資料」時，load 仍可點；後續視覺淡化以暗示先做前置。
            const dimmed = noData && step.key !== 'load';
            return (
              <li key={step.key}>
                <Link
                  to={step.to}
                  className={cn(
                    'group/step flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-foreground/5 transition-colors',
                    'hover:border-sidebar-primary/40 hover:bg-sidebar-accent/40',
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-primary/30',
                    dimmed && 'opacity-60',
                  )}
                  aria-label={`第 ${idx + 1} 步：${step.label}（${isDone ? '已完成' : '可開始'}）`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-xs font-medium ring-1',
                          isDone
                            ? 'bg-success/15 text-success ring-success/30'
                            : 'bg-muted text-muted-foreground ring-border',
                        )}
                        aria-hidden="true"
                      >
                        {isDone ? (
                          <Check className="size-3.5" />
                        ) : (
                          <CircleDashed className="size-3.5" />
                        )}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        第 {idx + 1} 步
                      </span>
                    </div>
                    <Icon
                      className="size-4 text-muted-foreground group-hover/step:text-sidebar-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-heading text-sm font-medium">
                      {step.label}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 4. 目前狀態小卡 */}
      <section
        aria-label="目前狀態"
        className="flex flex-col gap-3"
      >
        <h3 className="text-lg font-semibold tracking-tight">目前狀態</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="在職員工" value={stats.activeEmployees} />
          <StatCard label="部門" value={stats.departments} />
          <StatCard label="專案職能" value={stats.functions} />
          <StatCard label="已發布版本" value={stats.publishedVersions} />
          <StatCard label="流程定義" value={stats.processes} />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
