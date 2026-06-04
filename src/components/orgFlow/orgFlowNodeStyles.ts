import { cn } from '@/lib/utils';

export function orgFlowNodeClass(selected: boolean, extra?: string) {
  return cn(
    'min-w-[188px] rounded-xl border bg-card px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-foreground/5 transition-[box-shadow,border-color]',
    selected && 'border-primary shadow-md ring-2 ring-primary/25',
    extra,
  );
}
