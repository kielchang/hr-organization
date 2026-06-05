import { cn } from '@/lib/utils';
import type { NodeDiffStatus } from '../../types/editSession';

const diffClasses: Record<NodeDiffStatus, string> = {
  added: 'border-emerald-500 bg-emerald-50 ring-emerald-200',
  removed: 'border-red-400 bg-red-50 ring-red-200 opacity-60',
  modified: 'border-amber-400 bg-amber-50 ring-amber-200',
  unchanged: '',
};

export function orgFlowNodeClass(selected: boolean, diffStatus?: NodeDiffStatus, extra?: string) {
  return cn(
    'min-w-[188px] rounded-xl border bg-card px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-foreground/5 transition-[box-shadow,border-color]',
    selected && 'border-primary shadow-md ring-2 ring-primary/25',
    diffStatus && diffStatus !== 'unchanged' && diffClasses[diffStatus],
    extra,
  );
}
