import type {
  BpmnProcess,
  BpmnFlowNode,
  FlowCondition,
  ExpenseFormData,
  SimulationSession,
  SimulationLog,
} from '../types/bpmn';

// ─── condition evaluation ─────────────────────────────────────────────────────

function evalCondition(cond: FlowCondition, vars: Record<string, unknown>): boolean {
  const actual = vars[cond.variable];
  const expected = cond.value;
  const a = Number(actual);
  const e = Number(expected);
  switch (cond.operator) {
    case '<':  return a < e;
    case '<=': return a <= e;
    case '>':  return a > e;
    case '>=': return a >= e;
    case '==': return actual == expected;   // loose on purpose for string/num
    case '!=': return actual != expected;
    default:   return false;
  }
}

// ─── path resolver ────────────────────────────────────────────────────────────

/**
 * Walk the process graph and return an ordered list of node ids the token
 * will visit, given the supplied form variables.
 *
 * Gateway: tries edges in order; first matching condition wins; falls back to
 * defaultEdgeId then first edge.
 */
export function resolvePath(process: BpmnProcess, vars: Record<string, unknown>): string[] {
  const nodeById = new Map(process.nodes.map((n) => [n.id, n]));
  const edgesFrom = new Map<string, typeof process.edges>();
  for (const e of process.edges) {
    if (!edgesFrom.has(e.source)) edgesFrom.set(e.source, []);
    edgesFrom.get(e.source)!.push(e);
  }

  const startNode = process.nodes.find((n) => n.type === 'bpmnStart');
  if (!startNode) return [];

  const path: string[] = [];
  const visited = new Set<string>();
  let current: BpmnFlowNode | undefined = startNode;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current.id);

    if (current.type === 'bpmnEnd') break;

    const outEdges = edgesFrom.get(current.id) ?? [];

    let nextEdge = outEdges[0]; // default

    if (current.type === 'bpmnExclusiveGateway') {
      // 1. find first condition-matching edge
      const matched = outEdges.find((e) => e.condition && evalCondition(e.condition, vars));
      if (matched) {
        nextEdge = matched;
      } else {
        // fall back to default edge
        const defaultId = current.data.defaultEdgeId as string | undefined;
        nextEdge = (defaultId && outEdges.find((e) => e.id === defaultId)) ?? outEdges[0];
      }
    } else if (current.type === 'bpmnParallelGateway') {
      // simplified: just take first (real parallel needs token merging)
      nextEdge = outEdges[0];
    }

    if (!nextEdge) break;
    current = nodeById.get(nextEdge.target);
  }

  return path;
}

// ─── session factory ──────────────────────────────────────────────────────────

export function createSimulationSession(
  process: BpmnProcess,
  formData: ExpenseFormData,
): SimulationSession {
  const vars: Record<string, unknown> = {
    amount: formData.amount,
    category: formData.category,
  };

  const resolvedPath = resolvePath(process, vars);

  return {
    id: `sim-${Date.now()}`,
    processId: process.id,
    formData,
    resolvedPath,
    currentStep: 0,
    logs: [],
    status: 'running',
  };
}

// ─── step helpers ─────────────────────────────────────────────────────────────

export function advanceSession(
  session: SimulationSession,
  process: BpmnProcess,
  action: 'approved' | 'rejected' | 'auto',
  actorName?: string,
  actorJobLevel?: string,
  note?: string,
): SimulationSession {
  const currentNodeId = session.resolvedPath[session.currentStep];
  const node = process.nodes.find((n) => n.id === currentNodeId);

  const log: SimulationLog = {
    nodeId: currentNodeId,
    nodeLabel: node?.data.label ?? currentNodeId,
    action,
    actorName,
    actorJobLevel,
    timestamp: new Date().toISOString(),
    note,
  };

  if (action === 'rejected') {
    return { ...session, logs: [...session.logs, log], status: 'rejected' };
  }

  const nextStep = session.currentStep + 1;
  const isLast = nextStep >= session.resolvedPath.length;

  return {
    ...session,
    logs: [...session.logs, log],
    currentStep: nextStep,
    status: isLast ? 'approved' : 'running',
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Nodes that require human action (require stepping through) */
export function isInteractiveNode(node: BpmnFlowNode): boolean {
  return node.type === 'bpmnUserTask';
}

/** Format amount with TWD locale */
export function fmtAmount(n: number): string {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(n);
}
