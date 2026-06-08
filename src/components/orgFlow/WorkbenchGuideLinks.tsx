import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  FileSpreadsheet,
  GitCompareArrows,
  UsersRound,
  Workflow,
  Layers3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface GuideLink {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** 工作台底部「需要細節？」引導區的連結清單。 */
const GUIDE_LINKS: ReadonlyArray<GuideLink> = [
  {
    to: '/people',
    label: '人員管理',
    description: '逐筆檢視與編輯員工資料、職等與在職狀態。',
    icon: UsersRound,
  },
  {
    to: '/groups',
    label: '組別管理',
    description: '維護部門／職能組別、成員歸屬與主管設定。',
    icon: Layers3,
  },
  {
    to: '/compare',
    label: '情境比較',
    description: '並排比較不同調整方案的結構與健檢差異。',
    icon: GitCompareArrows,
  },
  {
    to: '/bpmn/impact',
    label: '流程衝擊分析',
    description: '查看組織調整對既有 BPMN 流程責任分派的影響。',
    icon: Workflow,
  },
  {
    to: '/csv-import',
    label: 'CSV 匯入',
    description: '從試算表批次匯入員工、組別與歸屬資料。',
    icon: FileSpreadsheet,
  },
];

/**
 * 工作台底部引導區：工作台聚焦「即時編輯與訊號」，需要逐筆細節或進階分析時，
 * 由此導向對應的專門頁面。
 */
export function WorkbenchGuideLinks() {
  return (
    <section aria-label="需要細節？" className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold tracking-tight">需要細節？</h3>
        <p className="text-xs text-muted-foreground">
          工作台聚焦即時編輯與健檢訊號；逐筆維護或進階分析請到對應頁面。
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDE_LINKS.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm ring-1 ring-foreground/5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mt-0.5 rounded-lg bg-muted p-1.5 text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {label}
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
