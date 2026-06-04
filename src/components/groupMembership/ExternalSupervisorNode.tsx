import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { orgFlowNodeClass } from '../orgFlow/orgFlowNodeStyles';

export interface ExternalSupervisorNodeData extends Record<string, unknown> {
  employeeId: string;
  name: string;
  groupName: string;
  jobLevelName: string;
}

export function ExternalSupervisorNode({ data, selected }: NodeProps) {
  const d = data as ExternalSupervisorNodeData;
  return (
    <div
      className={orgFlowNodeClass(
        !!selected,
        cn(
          'border-dashed border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/30',
          selected && 'border-amber-600 ring-amber-500/25',
        ),
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-background !bg-amber-600"
      />
      <div className="flex flex-col gap-1.5">
        <Badge
          variant="outline"
          className="w-fit border-amber-500/40 text-[10px] text-amber-800 dark:text-amber-200"
        >
          組外主管
        </Badge>
        <p className="font-medium leading-snug">{d.name}</p>
        <p className="text-xs text-muted-foreground">
          {d.groupName} · {d.jobLevelName}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-background !bg-amber-600"
      />
    </div>
  );
}
