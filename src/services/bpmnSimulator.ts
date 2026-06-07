import type {
  BpmnProcess,
  BpmnFlowNode,
  FlowCondition,
  ExpenseFormData,
  SimulationSession,
  SimulationLog,
  SimulationOrgContext,
  ApproverResolutionConfig,
} from '../types/bpmn';
import type { Assignment, OrgData } from '../types/org';
import { computePrimaryDepth, effectiveLevel } from './reportingDepth';

// ─── condition evaluation ─────────────────────────────────────────────────────

/**
 * 取得「申請人主歸屬所在組」視角下的主匯報深度。
 *
 * 與組織圖單組檢視一致：以該組所有歸屬為範圍計算主匯報深度，
 * 再由 effectiveLevel（覆寫優先）得出申請人的有效層級。
 */
function requesterEffectiveLevel(
  primaryAssignment: Assignment,
  orgData: OrgData,
): number {
  const groupAssignments = orgData.assignments.filter(
    (a) => a.groupId === primaryAssignment.groupId,
  );
  const depthMap = computePrimaryDepth(groupAssignments);
  return effectiveLevel(primaryAssignment, depthMap);
}

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
    case '==': return actual == expected;  // loose: 支援字串 / 數字比較
    case '!=': return actual != expected;
    default:   return false;
  }
}

// ─── org var resolver ─────────────────────────────────────────────────────────

/**
 * 從 orgData 中查詢申請人的組織變數，豐富 Gateway 條件評估用的 vars map。
 *
 * 新增的可用 variable 鍵：
 *   requesterJobLevelRank  — 申請人職等 rank（用於 "rank >= 40" 類條件）
 *   requesterGroupId       — 申請人主要所在組 ID
 *   requesterSupervisorId  — 申請人直屬主管 employeeId
 *   requesterLevel         — 組內匯報層深度
 */
export function resolveOrgVars(
  formData: ExpenseFormData,
  orgData: OrgData,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    amount: formData.amount,
    category: formData.category,
  };

  const primaryAssignment = orgData.assignments.find(
    (a) => a.employeeId === formData.requesterId && a.isPrimaryGroup,
  );
  if (!primaryAssignment) return base;

  const jobLevel = orgData.jobLevels.find((jl) => jl.id === primaryAssignment.jobLevelId);
  const group = orgData.groups.find((g) => g.id === primaryAssignment.groupId);

  return {
    ...base,
    requesterJobLevelRank: jobLevel?.rank ?? 0,
    requesterGroupId: primaryAssignment.groupId,
    requesterSupervisorId: primaryAssignment.primarySupervisorId ?? null,
    requesterLevel: requesterEffectiveLevel(primaryAssignment, orgData),
    // group metadata
    _requesterGroupParentId: group?.parentId ?? null,
  };
}

// ─── org context snapshot ─────────────────────────────────────────────────────

/** 擷取並快照申請當下的組織資訊（避免後續資料異動影響歷史紀錄）。 */
export function buildOrgContext(
  formData: ExpenseFormData,
  orgData: OrgData,
): SimulationOrgContext {
  const emp = orgData.employees.find((e) => e.id === formData.requesterId);
  const primaryAssignment = orgData.assignments.find(
    (a) => a.employeeId === formData.requesterId && a.isPrimaryGroup,
  );

  const jobLevel = primaryAssignment
    ? orgData.jobLevels.find((jl) => jl.id === primaryAssignment.jobLevelId)
    : undefined;
  const group = primaryAssignment
    ? orgData.groups.find((g) => g.id === primaryAssignment.groupId)
    : undefined;

  const supervisorEmp = primaryAssignment?.primarySupervisorId
    ? orgData.employees.find((e) => e.id === primaryAssignment.primarySupervisorId)
    : undefined;

  return {
    requesterId: formData.requesterId,
    requesterName: emp?.name ?? formData.requesterId,
    requesterJobLevelId: primaryAssignment?.jobLevelId ?? '',
    requesterJobLevelName: jobLevel?.name ?? '',
    requesterJobLevelRank: jobLevel?.rank ?? 0,
    requesterPrimaryGroupId: primaryAssignment?.groupId ?? '',
    requesterPrimaryGroupName: group?.name ?? '',
    requesterDirectSupervisorId: primaryAssignment?.primarySupervisorId ?? null,
    requesterDirectSupervisorName: supervisorEmp?.name ?? null,
    requesterOrgLevel: primaryAssignment
      ? requesterEffectiveLevel(primaryAssignment, orgData)
      : null,
  };
}

// ─── approver resolver ────────────────────────────────────────────────────────

/**
 * 依節點的 approverResolution 策略，從 orgData 中解析出可核准的 employeeId 陣列。
 * 若未設定 approverResolution，fallback 為 byJobLevel（向下相容）。
 */
export function resolveNodeApprovers(
  node: BpmnFlowNode,
  formData: ExpenseFormData,
  orgData: OrgData,
): string[] {
  const data = node.data;
  const resolution: ApproverResolutionConfig = data.approverResolution ?? {
    mode: 'byJobLevel',
    jobLevelIds: (data.assigneeJobLevelIds as string[]) ?? [],
  };

  const activeEmployeeIds = new Set(
    orgData.employees.filter((e) => e.status === 'active').map((e) => e.id),
  );

  const primaryAssignment = orgData.assignments.find(
    (a) => a.employeeId === formData.requesterId && a.isPrimaryGroup,
  );
  const requesterGroupId = primaryAssignment?.groupId;

  function byJobLevel(levelIds: string[]): string[] {
    if (!levelIds.length) return [];
    return [
      ...new Set(
        orgData.assignments
          .filter((a) => levelIds.includes(a.jobLevelId) && activeEmployeeIds.has(a.employeeId))
          .map((a) => a.employeeId),
      ),
    ];
  }

  function groupJobLevel(levelIds: string[], groupId: string | undefined): string[] {
    if (!levelIds.length || !groupId) return byJobLevel(levelIds);
    return [
      ...new Set(
        orgData.assignments
          .filter(
            (a) =>
              a.groupId === groupId &&
              levelIds.includes(a.jobLevelId) &&
              activeEmployeeIds.has(a.employeeId),
          )
          .map((a) => a.employeeId),
      ),
    ];
  }

  /**
   * orgHierarchy：從申請人的直屬主管開始向上追溯，
   * 找到第一個職等 rank >= minJobLevelRank 的人（避免循環，最多追 10 層）。
   */
  function orgHierarchy(minRank: number): string[] {
    if (!primaryAssignment) return [];
    const visited = new Set<string>();
    let currentSupervisorId = primaryAssignment.primarySupervisorId;
    let depth = 0;

    while (currentSupervisorId && depth < 10) {
      if (visited.has(currentSupervisorId)) break;
      visited.add(currentSupervisorId);
      depth++;

      if (!activeEmployeeIds.has(currentSupervisorId)) {
        // 跳過停用的主管，繼續往上找
        const supAssignment = orgData.assignments.find(
          (a) => a.employeeId === currentSupervisorId && a.isPrimaryGroup,
        );
        currentSupervisorId = supAssignment?.primarySupervisorId ?? null;
        continue;
      }

      const supAssignment = orgData.assignments.find(
        (a) => a.employeeId === currentSupervisorId && a.isPrimaryGroup,
      );
      const supJobLevel = supAssignment
        ? orgData.jobLevels.find((jl) => jl.id === supAssignment.jobLevelId)
        : undefined;

      if (supJobLevel && supJobLevel.rank >= minRank) {
        return [currentSupervisorId];
      }

      currentSupervisorId = supAssignment?.primarySupervisorId ?? null;
    }
    return [];
  }

  function applyFallback(primary: string[]): string[] {
    if (primary.length > 0) return primary;
    const fb = resolution.fallback;
    if (fb === 'byJobLevel') return byJobLevel(resolution.jobLevelIds ?? []);
    if (fb === 'orgHierarchy') return orgHierarchy(resolution.minJobLevelRank ?? 30);
    return primary;
  }

  switch (resolution.mode) {
    case 'byJobLevel': {
      const ids = resolution.jobLevelIds ?? (data.assigneeJobLevelIds as string[]) ?? [];
      return byJobLevel(ids);
    }
    case 'directSupervisor': {
      const supId = primaryAssignment?.primarySupervisorId;
      const result = supId && activeEmployeeIds.has(supId) ? [supId] : [];
      return applyFallback(result);
    }
    case 'groupJobLevel': {
      const ids = resolution.jobLevelIds ?? (data.assigneeJobLevelIds as string[]) ?? [];
      return applyFallback(groupJobLevel(ids, requesterGroupId));
    }
    case 'orgHierarchy': {
      return applyFallback(orgHierarchy(resolution.minJobLevelRank ?? 30));
    }
    default:
      return byJobLevel((data.assigneeJobLevelIds as string[]) ?? []);
  }
}

// ─── path resolver ────────────────────────────────────────────────────────────

export function resolvePath(
  process: BpmnProcess,
  vars: Record<string, unknown>,
): string[] {
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
    let nextEdge = outEdges[0];

    if (current.type === 'bpmnExclusiveGateway') {
      const matched = outEdges.find((e) => e.condition && evalCondition(e.condition, vars));
      if (matched) {
        nextEdge = matched;
      } else {
        const defaultId = current.data.defaultEdgeId as string | undefined;
        nextEdge = (defaultId ? outEdges.find((e) => e.id === defaultId) : undefined) ?? outEdges[0];
      }
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
  orgData: OrgData,
): SimulationSession {
  // 豐富閘道條件評估用的變數（加入組織資訊）
  const vars = resolveOrgVars(formData, orgData);
  const resolvedPath = resolvePath(process, vars);

  // 預計算各 userTask 節點的可核准人
  const resolvedApprovers: Record<string, string[]> = {};
  for (const nodeId of resolvedPath) {
    const node = process.nodes.find((n) => n.id === nodeId);
    if (node?.type === 'bpmnUserTask') {
      resolvedApprovers[nodeId] = resolveNodeApprovers(node, formData, orgData);
    }
  }

  return {
    id: `sim-${Date.now()}`,
    processId: process.id,
    processName: process.name,
    formData,
    resolvedPath,
    resolvedApprovers,
    orgContext: buildOrgContext(formData, orgData),
    currentStep: 0,
    logs: [],
    status: 'running',
    startedAt: new Date().toISOString(),
  };
}

// ─── step helpers ─────────────────────────────────────────────────────────────

export function advanceSession(
  session: SimulationSession,
  process: BpmnProcess,
  action: 'approved' | 'rejected' | 'auto',
  actorId?: string,
  actorName?: string,
  actorJobLevelId?: string,
  actorJobLevel?: string,
  note?: string,
): SimulationSession {
  const currentNodeId = session.resolvedPath[session.currentStep];
  const node = process.nodes.find((n) => n.id === currentNodeId);

  const log: SimulationLog = {
    nodeId: currentNodeId,
    nodeLabel: node?.data.label ?? currentNodeId,
    action,
    actorId,
    actorName,
    actorJobLevelId,
    actorJobLevel,
    timestamp: new Date().toISOString(),
    note,
  };

  if (action === 'rejected') {
    return {
      ...session,
      logs: [...session.logs, log],
      status: 'rejected',
      completedAt: new Date().toISOString(),
    };
  }

  const nextStep = session.currentStep + 1;
  const isLast = nextStep >= session.resolvedPath.length;
  const now = new Date().toISOString();

  return {
    ...session,
    logs: [...session.logs, log],
    currentStep: nextStep,
    status: isLast ? 'approved' : 'running',
    completedAt: isLast ? now : undefined,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function isInteractiveNode(node: BpmnFlowNode): boolean {
  return node.type === 'bpmnUserTask';
}

export function fmtAmount(n: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(n);
}
