import type { ProcessImpact } from '../../../types/bpmn';

interface Props {
  impacts: ProcessImpact[];
}

export function ImpactSummaryCards({ impacts }: Props) {
  const affected = impacts.filter((i) => i.severity !== 'none');
  const critical = affected.filter((i) => i.severity === 'critical').length;
  const high = affected.filter((i) => i.severity === 'high').length;
  const medium = affected.filter((i) => i.severity === 'medium').length;

  const cards = [
    {
      label: '受影響流程',
      value: affected.length,
      color: affected.length > 0 ? 'text-foreground' : 'text-muted-foreground',
      bg: 'bg-card',
    },
    {
      label: '嚴重（斷裂）',
      value: critical,
      color: critical > 0 ? 'text-destructive' : 'text-muted-foreground',
      bg: critical > 0 ? 'bg-rose-50 dark:bg-rose-950/20' : 'bg-card',
    },
    {
      label: '高（路徑異動）',
      value: high,
      color: high > 0 ? 'text-orange-600' : 'text-muted-foreground',
      bg: high > 0 ? 'bg-orange-50 dark:bg-orange-950/20' : 'bg-card',
    },
    {
      label: '中（核准人異動）',
      value: medium,
      color: medium > 0 ? 'text-amber-600' : 'text-muted-foreground',
      bg: medium > 0 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-card',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border border-border p-3 ${c.bg}`}>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
