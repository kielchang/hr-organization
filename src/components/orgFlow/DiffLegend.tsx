import { cn } from '@/lib/utils';

interface DiffLegendItem {
  color: string;
  label: string;
}

const items: DiffLegendItem[] = [
  { color: 'bg-emerald-500', label: '新增' },
  { color: 'bg-red-400', label: '移除' },
  { color: 'bg-amber-400', label: '已修改' },
];

export function DiffLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 text-xs text-muted-foreground', className)}>
      <span className="font-medium text-foreground">差異說明：</span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', item.color)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
