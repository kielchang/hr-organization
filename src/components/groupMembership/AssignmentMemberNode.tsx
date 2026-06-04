import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import type { Employee } from '../../types/org';
import { tagBadge } from '@/lib/uiSemantics';
import { orgFlowNodeClass } from '../orgFlow/orgFlowNodeStyles';

export interface AssignmentMemberNodeData extends Record<string, unknown> {
  assignmentId: string;
  employeeId: string;
  employee: Employee;
  jobLevelName: string;
  isPrimaryGroup: boolean;
  groupName: string;
}

export function AssignmentMemberNode({ data, selected }: NodeProps) {
  const d = data as AssignmentMemberNodeData;
  return (
    <div
      className={orgFlowNodeClass(!!selected, 'border-primary/40 ring-primary/10')}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-background !bg-primary"
      />
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          {d.groupName}
        </p>
        <p className="font-medium leading-snug">{d.employee.name}</p>
        <p className="text-xs text-muted-foreground">
          {d.employee.employeeNo} · {d.jobLevelName}
        </p>
        {d.isPrimaryGroup && (
          <Badge variant={tagBadge()} className="mt-0.5 w-fit text-[10px]">
            主組別
          </Badge>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}
