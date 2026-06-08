/**
 * All BPMN canvas node renderers, registered as React Flow node types.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { BpmnNodeData } from '../../../types/bpmn';

// ─── Shared token helper ──────────────────────────────────────────────────────

function nodeWrap(
  selected: boolean,
  extra: string,
  children: React.ReactNode,
  highlighted?: boolean,
) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center text-center text-xs font-medium transition-all',
        extra,
        selected && 'ring-2 ring-primary ring-offset-1',
        highlighted && 'ring-2 ring-amber-400 ring-offset-1 shadow-amber-200 shadow-md',
      )}
    >
      {children}
    </div>
  );
}

function BothHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-background !bg-primary" />
    </>
  );
}

// ─── Start Event ─────────────────────────────────────────────────────────────

export function BpmnStartNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  const highlighted = d.__highlighted as boolean | undefined;
  return nodeWrap(
    !!selected,
    'w-10 h-10 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700',
    <>
      <span className="text-[9px] leading-tight">{d.label}</span>
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-background !bg-emerald-500" />
    </>,
    highlighted,
  );
}

// ─── End Event ───────────────────────────────────────────────────────────────

export function BpmnEndNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  const highlighted = d.__highlighted as boolean | undefined;
  return nodeWrap(
    !!selected,
    'w-10 h-10 rounded-full border-4 border-rose-500 bg-rose-50 text-rose-700',
    <>
      <span className="text-[9px] leading-tight">{d.label}</span>
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-background !bg-rose-500" />
    </>,
    highlighted,
  );
}

// ─── User Task ───────────────────────────────────────────────────────────────

export function BpmnUserTaskNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  const highlighted = d.__highlighted as boolean | undefined;
  const isApprove = d.taskType === 'approve';
  return nodeWrap(
    !!selected,
    cn(
      'w-36 h-14 rounded-lg border-2 px-2 py-1 flex-col gap-0.5',
      isApprove
        ? 'border-blue-400 bg-blue-50 text-blue-800'
        : 'border-slate-400 bg-slate-50 text-slate-800',
    ),
    <>
      <div className="text-[9px] font-semibold uppercase tracking-wide opacity-60">
        {isApprove ? '核准' : '任務'}
      </div>
      <div className="text-xs font-semibold leading-snug">{d.label}</div>
      <BothHandles />
    </>,
    highlighted,
  );
}

// ─── Service Task ─────────────────────────────────────────────────────────────

export function BpmnServiceTaskNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  const highlighted = d.__highlighted as boolean | undefined;
  return nodeWrap(
    !!selected,
    'w-36 h-14 rounded-lg border-2 border-violet-400 bg-violet-50 px-2 py-1 flex-col gap-0.5 text-violet-800',
    <>
      <div className="text-[9px] font-semibold uppercase tracking-wide opacity-60">系統</div>
      <div className="text-xs font-semibold leading-snug">{d.label}</div>
      <BothHandles />
    </>,
    highlighted,
  );
}

// ─── Exclusive Gateway ────────────────────────────────────────────────────────

export function BpmnExclusiveGatewayNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  const highlighted = d.__highlighted as boolean | undefined;
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 items-center justify-center',
        selected && 'ring-2 ring-primary ring-offset-1 rounded',
        highlighted && 'ring-2 ring-amber-400 ring-offset-1 rounded',
      )}
    >
      {/* diamond */}
      <div className="h-9 w-9 rotate-45 rounded border-2 border-amber-500 bg-amber-50" />
      <span className="absolute text-sm font-bold text-amber-700">×</span>
      <Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-background !bg-amber-500" />
      <Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-background !bg-amber-500" />
      <Handle type="source" position={Position.Top} id="top" className="!size-2 !border-2 !border-background !bg-amber-500" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!size-2 !border-2 !border-background !bg-amber-500" />
      {d.label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground">
          {d.label}
        </span>
      )}
    </div>
  );
}

// ─── Parallel Gateway ────────────────────────────────────────────────────────

export function BpmnParallelGatewayNode({ selected, data }: NodeProps) {
  const d = data as BpmnNodeData;
  return (
    <div className={cn('relative flex h-10 w-10 items-center justify-center', selected && 'ring-2 ring-primary ring-offset-1 rounded')}>
      <div className="h-9 w-9 rotate-45 rounded border-2 border-teal-500 bg-teal-50" />
      <span className="absolute text-sm font-bold text-teal-700">+</span>
      <BothHandles />
      {d.label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground">
          {d.label}
        </span>
      )}
    </div>
  );
}
