import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import type { Employee } from '../../types/org';
import type { NodeDiffStatus } from '../../types/editSession';
import { tagBadge } from '@/lib/uiSemantics';
import { orgFlowNodeClass } from './orgFlowNodeStyles';

export interface EmployeeNodeData extends Record<string, unknown> {
  employee: Employee;
  /** 顯示用的 assignment id（拖拉改層級時更新此筆） */
  assignmentId: string;
  jobLevelName: string;
  isPrimaryGroup: boolean;
  groupName: string;
  /** 組織層級值（1-indexed） */
  level?: number;
  /** 該層的固定 top Y（拖曳吸附基準） */
  levelTopY?: number;
  /** 差異狀態（用於 diff 預覽著色） */
  diffStatus?: NodeDiffStatus;
}

export function EmployeeNode({ data, selected }: NodeProps) {
  const d = data as EmployeeNodeData;
  const isRemoved = d.diffStatus === 'removed';
  return (
    <div className={orgFlowNodeClass(!!selected, d.diffStatus)}>
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-2 !border-background !bg-primary"
      />
      <div className="flex flex-col gap-1">
        <p className={`font-medium leading-snug text-card-foreground ${isRemoved ? 'line-through' : ''}`}>
          {d.employee.name}
        </p>
        <p className="text-xs text-muted-foreground">{d.employee.employeeNo}</p>
        <p className="text-xs text-muted-foreground">{d.jobLevelName}</p>
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
