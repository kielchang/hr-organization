import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Crown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 組內匯報線示意（實線＝主匯報、虛線＝其他主管）。 */
function LegendLine({ dashed }: { dashed?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-0.5 w-5 shrink-0 rounded-full bg-foreground',
        dashed && 'h-0 border-b-2 border-dashed border-foreground bg-transparent',
      )}
      aria-hidden="true"
    />
  );
}

/**
 * 組別組織圖（唯讀）專屬圖例：驚嘆號 icon，hover／點擊彈出說明。
 *
 * 內容對齊組別視圖語意（一張連貫組織圖、每人一節點、同組以背景分區群聚；組長/共管
 * 以分區角落徽章標示），不沿用 reporting/membership 的 OrgFlowLegend（其文案為
 * 「每筆歸屬一節點」，與本視圖「每人一節點」不符）。徽章語意以文字＋icon 表達，不只靠顏色。
 */
export function GroupOrgLegendInfo() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
        onClick={() => setOpen((v) => !v)}
        title="圖例說明"
        aria-expanded={open}
      >
        <CircleAlert className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-max max-w-xs rounded-lg border border-border bg-card p-3 shadow-lg ring-1 ring-foreground/5">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p className="leading-relaxed">
              一張連貫的組織圖：每個節點為一位成員、匯報線依主管關係（含跨組）；同組成員聚在一起，以淡色背景分區標示組別。
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-center gap-2">
                <LegendLine />
                組內主匯報
              </span>
              <span className="inline-flex items-center gap-2">
                <LegendLine dashed />
                其他主管
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <Crown className="size-3 shrink-0 text-amber-600" aria-hidden="true" />
                組長
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3 shrink-0 text-sky-600" aria-hidden="true" />
                共管（與組長平行同層）
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
