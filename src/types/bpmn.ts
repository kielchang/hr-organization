// ─── BPMN Node / Edge ────────────────────────────────────────────────────────

export type BpmnNodeType =
  | 'bpmnStart'
  | 'bpmnEnd'
  | 'bpmnUserTask'
  | 'bpmnServiceTask'
  | 'bpmnExclusiveGateway'
  | 'bpmnParallelGateway';

export interface BpmnNodeData extends Record<string, unknown> {
  label: string;
  /** userTask / serviceTask */
  taskType?: 'submit' | 'approve' | 'review' | 'notify';
  /** jobLevel ids that can act on this userTask */
  assigneeJobLevelIds?: string[];
  /** gateway default outgoing edge id */
  defaultEdgeId?: string;
}

export interface BpmnFlowNode {
  id: string;
  type: BpmnNodeType;
  position: { x: number; y: number };
  data: BpmnNodeData;
}

export type ConditionOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

export interface FlowCondition {
  variable: string; // e.g. 'amount'
  operator: ConditionOperator;
  value: number | string;
}

export interface BpmnFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: FlowCondition;
}

// ─── Approval Config ─────────────────────────────────────────────────────────

/** 每個職等的最高可核准金額（0 = 無法核准） */
export interface ApprovalThreshold {
  jobLevelId: string;
  maxApprovalAmount: number;
}

// ─── Process ─────────────────────────────────────────────────────────────────

export interface BpmnProcess {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: BpmnFlowNode[];
  edges: BpmnFlowEdge[];
  approvalThresholds: ApprovalThreshold[];
  createdAt: string;
  updatedAt: string;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface ExpenseFormData {
  requesterId: string;   // employeeId
  amount: number;
  category: string;
  description: string;
  date: string;
}

export type SimulationStatus = 'idle' | 'running' | 'approved' | 'rejected';

export interface SimulationLog {
  nodeId: string;
  nodeLabel: string;
  action: 'submitted' | 'approved' | 'rejected' | 'auto';
  actorName?: string;
  actorJobLevel?: string;
  timestamp: string;
  note?: string;
}

export interface SimulationSession {
  id: string;
  processId: string;
  formData: ExpenseFormData;
  /** ordered node ids from start to end */
  resolvedPath: string[];
  currentStep: number;
  logs: SimulationLog[];
  status: SimulationStatus;
}

// ─── Store shape ──────────────────────────────────────────────────────────────

export interface BpmnStore {
  processes: BpmnProcess[];
  activeSession: SimulationSession | null;
}
