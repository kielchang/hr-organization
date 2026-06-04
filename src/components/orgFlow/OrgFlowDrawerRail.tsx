import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrgFlowDrawerRailProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/** 工具列右側長條：展開時 « 收合，收合時 » 展開 */
export function OrgFlowDrawerRail({ open, onToggle, className }: OrgFlowDrawerRailProps) {
  return (
    <button
      type="button"
      className={cn(
        'org-flow-drawer-rail flex h-full w-7 shrink-0 cursor-pointer flex-col items-center justify-center rounded-none border-0 border-l border-border/50 bg-transparent text-muted-foreground shadow-none transition-colors hover:bg-muted/40 hover:text-foreground',
        !open && 'border-l-0',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      title={open ? '收合左側工具' : '展開左側工具'}
      aria-expanded={open}
      aria-label={open ? '收合左側工具' : '展開左側工具'}
    >
      {open ? (
        <ChevronsLeft className="size-4 shrink-0" strokeWidth={2.5} />
      ) : (
        <ChevronsRight className="size-4 shrink-0" strokeWidth={2.5} />
      )}
    </button>
  );
}
