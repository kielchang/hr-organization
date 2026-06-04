import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge, Text } from '@fluentui/react-components';

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
      className={`external-supervisor-node${selected ? ' external-supervisor-node--selected' : ''}`}
    >
      <Handle type="target" position={Position.Top} />
      <Badge appearance="outline" color="warning" size="small">
        組外主管
      </Badge>
      <Text weight="semibold" block>
        {d.name}
      </Text>
      <Text size={200} block>
        {d.groupName} · {d.jobLevelName}
      </Text>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
