import { useMemo, useState } from 'react';
import {
  GaugeCircle,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonIntent } from '@/lib/uiSemantics';
import { FindingGroup } from '../orgHealth/FindingGroup';
import { FunctionCoveragePanel } from '../groupMembership/FunctionCoveragePanel';
import {
  buildReadiness,
  filterFindingsForEmployee,
  type OrgHealth,
  type OrgHealthFinding,
  type ReadinessResult,
} from '../../services/orgHealth';
import type { OrgData } from '../../types/org';

/** findings 分群固定順序（warning 為主的群優先），對齊規劃健檢頁。 */
const CATEGORY_ORDER: ReadonlyArray<OrgHealthFinding['category']> = [
  'chain',
  'cycle',
  'spof',
  'span',
  'function',
  'depth',
];

/** 就緒度等級 → Badge variant 與中文標籤（對齊規劃健檢頁語意）。 */
const readinessLevelMeta: Record<
  ReadinessResult['level'],
  { variant: 'success' | 'warning' | 'destructive'; label: string }
> = {
  high: { variant: 'success', label: '結構就緒' },
  medium: { variant: 'warning', label: '尚需補強' },
  low: { variant: 'destructive', label: '結構待整理' },
};

interface WorkbenchInsightPanelProps {
  /** 由頁面層共用的 buildOrgHealth(orgData) 結果（即時反映 draft）。 */
  health: OrgHealth;
  /** 供 FunctionCoveragePanel 自行 memo 的資料源（編輯中＝draft）。 */
  orgData: OrgData;
  /** 目前選中的員工（無選中為 null）。 */
  selectedEmployeeId: string | null;
  /** 選中員工的顯示姓名（找不到則為 undefined）。 */
  selectedEmployeeName?: string;
}

/**
 * 工作台右側即時整合面板（可摺疊）。
 *
 * - landmark：以 <aside aria-label> 標示；摺疊鈕鍵盤可及、aria-expanded 同步。
 * - 即時反映 health（呼叫端傳入 buildOrgHealth(orgData) 的單一 memo 結果）。
 * - CM 防過載：findings 預設只顯示 warning，提供「展開全部（含提示）」切換露出 info。
 * - 選中節點：頂部顯示「{姓名} 的相關提醒」，findings 縮限到該人；無選中顯示全域。
 * - readiness／職能覆蓋一律呈現全域訊號（縮限到單人無意義）。
 */
export function WorkbenchInsightPanel({
  health,
  orgData,
  selectedEmployeeId,
  selectedEmployeeName,
}: WorkbenchInsightPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  /** CM 防過載：預設只看 warning；切換後連 info 一起看。 */
  const [showAll, setShowAll] = useState(false);

  const readiness = useMemo(() => buildReadiness(health), [health]);
  const readinessMeta = readinessLevelMeta[readiness.level];

  // 選中時縮限到該人，否則全域。
  const scopedFindings = useMemo(
    () =>
      selectedEmployeeId
        ? filterFindingsForEmployee(health.findings, selectedEmployeeId)
        : health.findings,
    [health.findings, selectedEmployeeId],
  );

  const infoCount = useMemo(
    () => scopedFindings.filter((f) => f.severity === 'info').length,
    [scopedFindings],
  );

  // 套用 CM 過濾（預設僅 warning）後依固定 category 分群（空群不顯示）。
  const findingGroups = useMemo(() => {
    const visible = showAll
      ? scopedFindings
      : scopedFindings.filter((f) => f.severity === 'warning');
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: visible.filter((f) => f.category === category),
    })).filter((g) => g.items.length > 0);
  }, [scopedFindings, showAll]);

  if (collapsed) {
    return (
      <aside
        aria-label="即時整合面板（已收合）"
        className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-border bg-card py-3 shadow-sm"
      >
        <Button
          type="button"
          variant={buttonIntent.quiet}
          size="icon-sm"
          aria-expanded={false}
          aria-label="展開即時整合面板"
          title="展開即時整合面板"
          onClick={() => setCollapsed(false)}
        >
          <PanelRightOpen className="size-4" />
        </Button>
        <span
          className="mt-2 text-[10px] [writing-mode:vertical-rl] text-muted-foreground"
          aria-hidden="true"
        >
          即時面板
        </span>
      </aside>
    );
  }

  return (
    <aside
      aria-label="即時整合面板"
      className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">即時整合面板</span>
        <Button
          type="button"
          variant={buttonIntent.quiet}
          size="icon-sm"
          aria-expanded
          aria-label="收合即時整合面板"
          title="收合即時整合面板"
          onClick={() => setCollapsed(true)}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* 規劃就緒度徽章 */}
        <section
          aria-label="規劃就緒度"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 ring-1 ring-foreground/5"
        >
          <div className="flex items-center gap-2">
            <GaugeCircle className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">規劃就緒度</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums leading-none">
              {readiness.total}
            </span>
            <span className="text-[11px] text-muted-foreground">/ 100</span>
            <Badge variant={readinessMeta.variant}>{readinessMeta.label}</Badge>
          </div>
        </section>

        {/* 即時提醒（findings） */}
        <section aria-label="即時提醒" className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            {selectedEmployeeId ? (
              <UserRound className="size-4 text-muted-foreground" />
            ) : (
              <ShieldAlert className="size-4 text-muted-foreground" />
            )}
            <h3 className="text-sm font-semibold tracking-tight">
              {selectedEmployeeId
                ? `${selectedEmployeeName ?? '此員工'} 的相關提醒`
                : '即時提醒'}
            </h3>
          </header>

          {findingGroups.length === 0 ? (
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {selectedEmployeeId
                ? showAll
                  ? '此員工目前沒有相關提醒。'
                  : '此員工目前沒有警示。'
                : showAll
                  ? '目前沒有任何提醒，組織結構健康。'
                  : '目前沒有警示。'}
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

          {/* CM 防過載切換：露出／收起 info 級提示 */}
          {(showAll || infoCount > 0) && (
            <Button
              type="button"
              variant={buttonIntent.quiet}
              size="sm"
              className="self-start"
              aria-pressed={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? '只看警示'
                : `展開全部（含 ${infoCount} 則提示）`}
            </Button>
          )}
        </section>

        {/* 職能覆蓋（全域，獨立 memo 於 orgData） */}
        <section aria-label="職能覆蓋">
          <FunctionCoveragePanel data={orgData} />
        </section>
      </div>
    </aside>
  );
}
