import { type NodeProps } from '@xyflow/react';
import { Text } from '@fluentui/react-components';

export interface GroupLabelNodeData extends Record<string, unknown> {
  groupName: string;
  memberCount: number;
}

export function GroupLabelNode({ data }: NodeProps) {
  const d = data as GroupLabelNodeData;
  return (
    <div className="group-label-node">
      <Text weight="semibold">{d.groupName}</Text>
      <Text size={200}>（{d.memberCount} 人歸屬）</Text>
    </div>
  );
}
