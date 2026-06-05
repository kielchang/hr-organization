import { useEffect, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { ChevronDown, Minus, Mouse, Plus, Touchpad } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OrgFlowNavMode = 'mouse' | 'trackpad';

interface OrgFlowControlBarProps {
  navMode: OrgFlowNavMode;
  onNavModeChange: (mode: OrgFlowNavMode) => void;
  className?: string;
}

const iconBtn =
  'flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4';

const navOptions: {
  value: OrgFlowNavMode;
  icon: typeof Mouse;
  title: string;
  desc: string;
}[] = [
  {
    value: 'mouse',
    icon: Mouse,
    title: '滑鼠模式',
    desc: '右鍵拖曳移動 / 滾輪縮放',
  },
  {
    value: 'trackpad',
    icon: Touchpad,
    title: '觸控板模式',
    desc: '滑動移動 / 雙指縮放',
  },
];

/** 水平控制列：導航模式 / 適配畫面 / 縮放百分比 / 放大 / 縮小 */
export function OrgFlowControlBar({
  navMode,
  onNavModeChange,
  className,
}: OrgFlowControlBarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [menuOpen]);

  const pct = Math.round(zoom * 100);
  const CurrentNavIcon = navOptions.find((o) => o.value === navMode)?.icon ?? Mouse;

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg ring-1 ring-foreground/5">
          {navOptions.map(({ value, icon: Icon, title, desc }) => {
            const active = navMode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onNavModeChange(value);
                  setMenuOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted',
                  active && 'bg-accent',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-5 shrink-0 text-muted-foreground',
                    active && 'text-accent-foreground',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{title}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm">
        <button
          type="button"
          className={cn(
            'flex h-8 shrink-0 items-center gap-0.5 rounded-lg pl-2 pr-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4',
            menuOpen && 'bg-muted text-foreground',
          )}
          onClick={() => setMenuOpen((v) => !v)}
          title={`導航模式：${navMode === 'mouse' ? '滑鼠' : '觸控板'}`}
          aria-expanded={menuOpen}
        >
          <CurrentNavIcon />
          <ChevronDown
            className={cn('!size-3 transition-transform', menuOpen && 'rotate-180')}
          />
        </button>
        <button
          type="button"
          className="min-w-[3rem] rounded-lg px-2 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
          onClick={() => fitView({ padding: 0.2 })}
          title="重設縮放（適配畫面）"
        >
          {pct}%
        </button>
        <button type="button" className={iconBtn} onClick={() => zoomIn()} title="放大">
          <Plus />
        </button>
        <button type="button" className={iconBtn} onClick={() => zoomOut()} title="縮小">
          <Minus />
        </button>
      </div>
    </div>
  );
}
