import type {
  BpmnProcess,
  ProbeScenario,
  NodeHealth,
  ProcessHealth,
  ProcessImpact,
  ScenarioImpact,
  NodeApproverChange,
  ImpactLevel,
} from '../types/bpmn';
import type { OrgData } from '../types/org';
import {
  createSimulationSession,
  resolveNodeApprovers,
  fmtAmount,
} from './bpmnSimulator';

// ─── Amount band extraction ───────────────────────────────────────────────────

function extractAmountBands(process: BpmnProcess): number[] {
  const breakpoints = new Set<number>();

  for (const edge of process.edges) {
    const cond = edge.condition;
    if (cond?.variable === 'amount' && typeof cond.value === 'number' && cond.value > 0) {
      breakpoints.add(cond.value);
    }
  }
  for (const t of process.approvalThresholds) {
    if (t.maxApprovalAmount > 0) breakpoints.add(t.maxApprovalAmount);
  }

  if (breakpoints.size === 0) return [1000, 50000, 200000];

  const sorted = [...breakpoints].sort((a, b) => a - b);
  const bands: number[] = [];

  // Below first breakpoint
  bands.push(Math.max(1, Math.floor(sorted[0] * 0.5)));

  // Midpoint between each pair of adjacent breakpoints
  for (let i = 0; i < sorted.length - 1; i++) {
    bands.push(Math.floor((sorted[i] + sorted[i + 1]) / 2));
  }

  // Above last breakpoint
  bands.push(sorted[sorted.length - 1] * 2);

  return [...new Set(bands)];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 由 gateway 條件與核決閾值萃取金額帶，搭配所有 active 員工產生探測情境。
 */
export function generateProbeScenarios(process: BpmnProcess, orgData: OrgData): ProbeScenario[] {
  const amounts = extractAmountBands(process);
  const activeEmployees = orgData.employees.filter((e) => e.status === 'active');

  const scenarios: ProbeScenario[] = [];
  for (const emp of activeEmployees) {
    for (const amount of amounts) {
      scenarios.push({
        requesterId: emp.id,
        requesterName: emp.name,
        amount,
        amountBandLabel: fmtAmount(amount),
        category: '差旅費',
      });
    }
  }
  return scenarios;
}

/**
 * 即時健檢：對每個 userTask 節點 × 每個 active 員工，
 * 統計 0 人（broken）/ 1 人（SPOF）並彙整節點與流程嚴重度。
 */
export function analyzeProcessHealth(process: BpmnProcess, orgData: OrgData): ProcessHealth {
  const activeEmployees = orgData.employees.filter((e) => e.status === 'active');
  const userTaskNodes = process.nodes.filter((n) => n.type === 'bpmnUserTask');

  const nodeHealthList: NodeHealth[] = userTaskNodes.map((node) => {
    const brokenRequesters: { id: string; name: string }[] = [];
    const spofRequesters: { id: string; name: string }[] = [];
    let okCount = 0;

    for (const emp of activeEmployees) {
      const dummyForm = {
        requesterId: emp.id,
        amount: 50000,
        category: '差旅費',
        description: '',
        date: new Date().toISOString().split('T')[0],
      };
      const approvers = resolveNodeApprovers(node, dummyForm, orgData);
      if (approvers.length === 0) {
        brokenRequesters.push({ id: emp.id, name: emp.name });
      } else if (approvers.length === 1) {
        spofRequesters.push({ id: emp.id, name: emp.name });
        okCount++;
      } else {
        okCount++;
      }
    }

    const severity: NodeHealth['severity'] =
      brokenRequesters.length > 0 ? 'critical' :
      spofRequesters.length > 0 ? 'warning' : 'ok';

    const resolution = node.data.approverResolution;
    const mode = (resolution?.mode ?? 'byJobLevel') as import('../types/bpmn').ApproverResolutionMode;

    return {
      nodeId: node.id,
      nodeLabel: node.data.label,
      mode,
      brokenRequesters,
      spofRequesters,
      okScenarioCount: okCount,
      severity,
    };
  });

  const processSeverity: ProcessHealth['severity'] =
    nodeHealthList.some((n) => n.severity === 'critical') ? 'critical' :
    nodeHealthList.some((n) => n.severity === 'warning') ? 'warning' : 'ok';

  return {
    processId: process.id,
    processName: process.name,
    nodes: nodeHealthList,
    severity: processSeverity,
  };
}

/**
 * 變更影響分析：對每個探測情境分別在 before/after 兩份 orgData 上跑模擬，
 * 比對 resolvedPath 與 resolvedApprovers 差異，量化影響程度。
 */
export function diffProcessImpact(
  process: BpmnProcess,
  baselineOrg: OrgData,
  targetOrg: OrgData,
): ProcessImpact {
  const scenarios = generateProbeScenarios(process, baselineOrg);

  const affectedScenarios: ScenarioImpact[] = [];
  const affectedNodeIds = new Set<string>();
  const affectedRequesterIds = new Set<string>();

  for (const scenario of scenarios) {
    // Skip employees who don't exist in the target org
    if (!targetOrg.employees.find((e) => e.id === scenario.requesterId)) continue;

    const formData = {
      requesterId: scenario.requesterId,
      amount: scenario.amount,
      category: scenario.category,
      description: '',
      date: new Date().toISOString().split('T')[0],
    };

    let beforeSession: ReturnType<typeof createSimulationSession>;
    let afterSession: ReturnType<typeof createSimulationSession>;
    try {
      beforeSession = createSimulationSession(process, formData, baselineOrg);
      afterSession = createSimulationSession(process, formData, targetOrg);
    } catch {
      continue;
    }

    const pathChanged =
      beforeSession.resolvedPath.join(',') !== afterSession.resolvedPath.join(',');

    // Compare approvers for all userTask nodes that appear in either path
    const allNodeIds = new Set([
      ...beforeSession.resolvedPath,
      ...afterSession.resolvedPath,
    ]);

    const nodeApproverChanges: NodeApproverChange[] = [];

    for (const nodeId of allNodeIds) {
      const node = process.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'bpmnUserTask') continue;

      const beforeIds = beforeSession.resolvedApprovers[nodeId] ?? [];
      const afterIds = afterSession.resolvedApprovers[nodeId] ?? [];

      const beforeSet = new Set(beforeIds);
      const afterSet = new Set(afterIds);
      const changed =
        beforeIds.length !== afterIds.length ||
        beforeIds.some((id) => !afterSet.has(id)) ||
        afterIds.some((id) => !beforeSet.has(id));

      if (!changed) continue;

      const toNamed = (ids: string[], org: OrgData) =>
        ids.map((id) => ({
          id,
          name: org.employees.find((e) => e.id === id)?.name ?? id,
        }));

      nodeApproverChanges.push({
        nodeId,
        nodeLabel: node.data.label,
        before: toNamed(beforeIds, baselineOrg),
        after: toNamed(afterIds, targetOrg),
        becameBroken: beforeIds.length > 0 && afterIds.length === 0,
      });

      affectedNodeIds.add(nodeId);
    }

    if (!pathChanged && nodeApproverChanges.length === 0) continue;

    affectedRequesterIds.add(scenario.requesterId);

    const toLabels = (path: string[]) =>
      path.map((nid) => process.nodes.find((n) => n.id === nid)?.data.label ?? nid);

    affectedScenarios.push({
      scenario,
      pathChanged,
      pathBeforeLabels: toLabels(beforeSession.resolvedPath),
      pathAfterLabels: toLabels(afterSession.resolvedPath),
      nodeApproverChanges,
    });
  }

  // Compute severity
  let severity: ImpactLevel = 'none';

  if (affectedScenarios.some((si) => si.nodeApproverChanges.some((c) => c.becameBroken))) {
    severity = 'critical';
  } else if (
    affectedScenarios.some((si) => {
      if (si.pathChanged) return true;
      return si.nodeApproverChanges.some((c) => {
        const node = process.nodes.find((n) => n.id === c.nodeId);
        const mode = node?.data.approverResolution?.mode;
        return mode === 'directSupervisor' || mode === 'orgHierarchy';
      });
    })
  ) {
    severity = 'high';
  } else if (affectedScenarios.length > 0) {
    severity = 'medium';
  }

  return {
    processId: process.id,
    processName: process.name,
    affectedScenarios,
    affectedNodeIds: [...affectedNodeIds],
    affectedRequesterIds: [...affectedRequesterIds],
    severity,
  };
}
