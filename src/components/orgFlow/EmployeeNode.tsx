import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, Text } from '@fluentui/react-components';
import type { Employee } from '../../types/org';

export interface EmployeeNodeData extends Record<string, unknown> {
  employee: Employee;
  jobLevelName: string;
  isPrimaryGroup: boolean;
  groupName: string;
}

export function EmployeeNode({ data, selected }: NodeProps) {
  const d = data as EmployeeNodeData;
  return (
    <div
      className={`employee-node${selected ? ' employee-node--selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <Text weight="semibold" block>
        {d.employee.name}
      </Text>
      <Text size={200} block>
        {d.employee.employeeNo}
      </Text>
      <Text size={200} block>
        {d.jobLevelName}
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
