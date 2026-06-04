import { type NodeProps } from '@xyflow/react';

export interface GroupLabelNodeData extends Record<string, unknown> {
  groupName: string;
  memberCount: number;
}

export function GroupLabelNode({ data }: NodeProps) {
  const d = data as GroupLabelNodeData;
  return (
    <div className="pointer-events-none min-w-[200px] rounded-lg border border-border bg-muted/80 px-4 py-2 text-center shadow-sm ring-1 ring-foreground/5 backdrop-blur-sm">
      <p className="text-sm font-semibold text-foreground">{d.groupName}</p>
      <p className="text-xs text-muted-foreground">（{d.memberCount} 人歸屬）</p>
    </div>
  );
}
