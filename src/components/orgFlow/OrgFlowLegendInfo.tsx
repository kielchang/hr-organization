import { useEffect, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrgFlowLegend } from './OrgFlowLegend';
import type { OrgFlowChartVariant } from './OrgFlowControls';

interface OrgFlowLegendInfoProps {
  variant: OrgFlowChartVariant;
}

/** 驚嘆號 icon：滑鼠移上或點擊彈出圖例提示 */
export function OrgFlowLegendInfo({ variant }: OrgFlowLegendInfoProps) {
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
        <div className="absolute right-0 top-full z-20 mt-2 w-max rounded-lg border border-border bg-card p-3 shadow-lg ring-1 ring-foreground/5">
          <OrgFlowLegend variant={variant} />
        </div>
      )}
    </div>
  );
}
