// ─── Approver Resolution ─────────────────────────────────────────────────────

export type ApproverResolutionMode =
  | 'byJobLevel'       // 全公司符合職等（預設）
  | 'directSupervisor' // 申請人的直屬主管
  | 'groupJobLevel'    // 申請人所在組 × 指定職等
  | 'orgHierarchy';    // 向上追溯直到 rank >= minJobLevelRank

export interface ApproverResolutionConfig {
  mode: ApproverResolutionMode;
  /** byJobLevel / groupJobLevel：指定可核准職等 ID 陣列 */
  jobLevelIds?: string[];
  /** orgHierarchy：最低可核准 rank */
  minJobLevelRank?: number;
  /** 找不到核准人時的備援策略 */
  fallback?: 'byJobLevel' | 'orgHierarchy';
}

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
  /**
   * 保留現有 byJobLevel 用；approverResolution 未設時以此決定可核准職等。
   * approverResolution 設為 byJobLevel/groupJobLevel 時，若 jobLevelIds 為空
   * 則 fallback 使用此欄位。
   */
  assigneeJobLevelIds?: string[];
  /** 動態核准人解析策略（新增） */
  approverResolution?: ApproverResolutionConfig;
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

/**
 * 可用的條件變數（閘道條件評估時的 vars 鍵值）：
 *   表單變數：amount, category
 *   組織變數：requesterJobLevelRank, requesterGroupId, requesterLevel
 */
export interface FlowCondition {
  variable: string;
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
  /** 流程生命週期（新增） */
  status: 'active' | 'draft' | 'archived';
  /** 版本號，每次儲存遞增（新增；DB 樂觀鎖準備） */
  version: number;
  nodes: BpmnFlowNode[];
  edges: BpmnFlowEdge[];
  approvalThresholds: ApprovalThreshold[];
  createdAt: string;
  updatedAt: string;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface ExpenseFormData {
  requesterId: string;
  amount: number;
  category: string;
  description: string;
  date: string;
}

/** 提交當下的組織快照，避免後續資料異動影響歷史脈絡（DB: JSONB column） */
export interface SimulationOrgContext {
  requesterId: string;
  requesterName: string;
  requesterJobLevelId: string;
  requesterJobLevelName: string;
  requesterJobLevelRank: number;
  requesterPrimaryGroupId: string;
  requesterPrimaryGroupName: string;
  requesterDirectSupervisorId: string | null;
  requesterDirectSupervisorName: string | null;
  /** 組內匯報層深度（1-indexed） */
  requesterOrgLevel: number | null;
}

export type SimulationStatus = 'idle' | 'running' | 'approved' | 'rejected';

export interface SimulationLog {
  nodeId: string;
  nodeLabel: string;
  action: 'submitted' | 'approved' | 'rejected' | 'auto';
  /** 穩定 FK 參照（DB: FK → employees.id）（新增） */
  actorId?: string;
  actorName?: string;
  /** 穩定 FK 參照（DB: FK → job_levels.id）（新增） */
  actorJobLevelId?: string;
  actorJobLevel?: string;
  timestamp: string;
  note?: string;
}

export interface SimulationSession {
  id: string;
  processId: string;
  /** 提交時的流程名稱（denormalized，歷史頁籤顯示用）（新增） */
  processName: string;
  formData: ExpenseFormData;
  /** 解析後的有序節點 ID 陣列 */
  resolvedPath: string[];
  /** 預計算的各節點可核准人 employeeId 陣列（新增；DB: simulation_resolved table） */
  resolvedApprovers: Record<string, string[]>;
  /** 提交時的組織快照（新增） */
  orgContext: SimulationOrgContext;
  currentStep: number;
  logs: SimulationLog[];
  status: SimulationStatus;
  /** 模擬開始時間（新增） */
  startedAt: string;
  /** 核准或拒絕時設定（新增） */
  completedAt?: string;
}

// ─── Store shape ──────────────────────────────────────────────────────────────

export interface BpmnStore {
  /** Schema 版本（v1=舊格式無此欄；v2=本版；v3=加入影響分析基準） */
  schemaVersion: number;
  processes: BpmnProcess[];
  activeSession: SimulationSession | null;
  /** 已完成的模擬紀錄（稽核歷程） */
  simulationHistory: SimulationSession[];
  /** 影響分析基準快照 */
  impactBaseline?: ImpactBaseline | null;
}

// ─── Impact Analysis ──────────────────────────────────────────────────────────

import type { OrgData } from './org';

/** 探測情境：requester × 金額帶，用於影響比對與健檢 */
export interface ProbeScenario {
  requesterId: string;
  requesterName: string;
  amount: number;
  amountBandLabel: string;
  category: string;
}

export type ImpactLevel = 'critical' | 'high' | 'medium' | 'none';

// ── 即時健檢（無基準）──────────────────────────────────────────────────────

export interface NodeHealth {
  nodeId: string;
  nodeLabel: string;
  mode: ApproverResolutionMode;
  /** 0 個可核准人的申請人 */
  brokenRequesters: { id: string; name: string }[];
  /** 僅 1 個可核准人（單點風險） */
  spofRequesters: { id: string; name: string }[];
  okScenarioCount: number;
  severity: 'critical' | 'warning' | 'ok';
}

export interface ProcessHealth {
  processId: string;
  processName: string;
  nodes: NodeHealth[];
  severity: 'critical' | 'warning' | 'ok';
}

// ── 變更影響（before vs after）────────────────────────────────────────────────

export interface NodeApproverChange {
  nodeId: string;
  nodeLabel: string;
  before: { id: string; name: string }[];
  after: { id: string; name: string }[];
  /** after 為空、before 非空 → 斷裂 */
  becameBroken: boolean;
}

export interface ScenarioImpact {
  scenario: ProbeScenario;
  pathChanged: boolean;
  pathBeforeLabels: string[];
  pathAfterLabels: string[];
  /** 僅收錄有變動的節點 */
  nodeApproverChanges: NodeApproverChange[];
}

export interface ProcessImpact {
  processId: string;
  processName: string;
  affectedScenarios: ScenarioImpact[];
  affectedNodeIds: string[];
  affectedRequesterIds: string[];
  severity: ImpactLevel;
}

// ── 基準快照 ──────────────────────────────────────────────────────────────────

export interface ImpactBaseline {
  capturedAt: string;
  label: string;
  data: OrgData;
}
