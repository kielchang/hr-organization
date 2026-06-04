import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, Text } from '@fluentui/react-components';
import type { Employee } from '../../types/org';

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
      className={`assignment-member-node${selected ? ' assignment-member-node--selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <Text size={200} block className="assignment-member-node__group">
        {d.groupName}
      </Text>
      <Text weight="semibold" block>
        {d.employee.name}
      </Text>
      <Text size={200} block>
        {d.employee.employeeNo} · {d.jobLevelName}
      </Text>
      {d.isPrimaryGroup && (
        <Badge appearance="filled" color="brand" size="small">
          主組別
        </Badge>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
