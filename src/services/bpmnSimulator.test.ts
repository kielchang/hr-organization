import {
  advanceSession,
  createSimulationSession,
  resolveNodeApprovers,
  resolveOrgVars,
  resolvePath,
} from './bpmnSimulator';
import type {
  ApproverResolutionConfig,
  BpmnFlowEdge,
  BpmnFlowNode,
  BpmnNodeType,
  BpmnProcess,
  ExpenseFormData,
  FlowCondition,
  SimulationSession,
} from '../types/bpmn';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

// req(專員) → mgr(經理) → dir(總監)；gone 為停用主管
function org() {
  return makeOrgData({
    employees: [emp('req'), emp('mgr'), emp('dir'), emp('gone', { status: 'inactive' })],
    groups: [group('g1')],
    jobLevels: [
      jobLevel('j-staff', 10),
      jobLevel('j-mgr', 40),
      jobLevel('j-dir', 50),
    ],
    assignments: [
      assignment('a-req', {
        employeeId: 'req',
        groupId: 'g1',
        jobLevelId: 'j-staff',
        supervisorIds: ['mgr'],
        primarySupervisorId: 'mgr',
        level: 3,
      }),
      assignment('a-mgr', {
        employeeId: 'mgr',
        groupId: 'g1',
        jobLevelId: 'j-mgr',
        supervisorIds: ['dir'],
        primarySupervisorId: 'dir',
        level: 2,
      }),
      assignment('a-dir', { employeeId: 'dir', groupId: 'g1', jobLevelId: 'j-dir', level: 1 }),
      assignment('a-gone', { employeeId: 'gone', groupId: 'g1', jobLevelId: 'j-mgr' }),
    ],
  });
}

const form = (amount: number): ExpenseFormData => ({
  requesterId: 'req',
  amount,
  category: 'travel',
  description: '',
  date: '2026-01-01',
});

function node(id: string, type: BpmnNodeType, extra: Partial<BpmnFlowNode['data']> = {}): BpmnFlowNode {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id, ...extra } };
}
function userTask(id: string, resolution: ApproverResolutionConfig): BpmnFlowNode {
  return node(id, 'bpmnUserTask', { approverResolution: resolution });
}
function edge(id: string, source: string, target: string, condition?: FlowCondition): BpmnFlowEdge {
  return { id, source, target, condition };
}

describe('resolveOrgVars', () => {
  it('帶出申請人的組織變數', () => {
    const vars = resolveOrgVars(form(5000), org());
    expect(vars.amount).toBe(5000);
    expect(vars.requesterJobLevelRank).toBe(10);
    expect(vars.requesterGroupId).toBe('g1');
    expect(vars.requesterSupervisorId).toBe('mgr');
    expect(vars.requesterLevel).toBe(3);
  });

  it('找不到主要歸屬時只回基本變數', () => {
    const vars = resolveOrgVars({ ...form(100), requesterId: 'unknown' }, org());
    expect(vars).toEqual({ amount: 100, category: 'travel' });
  });
});

describe('resolveNodeApprovers', () => {
  it('byJobLevel：回符合職等的在職員工（排除停用）', () => {
    const n = userTask('t', { mode: 'byJobLevel', jobLevelIds: ['j-mgr'] });
    expect(resolveNodeApprovers(n, form(100), org())).toEqual(['mgr']);
  });

  it('directSupervisor：回直屬主管', () => {
    const n = userTask('t', { mode: 'directSupervisor' });
    expect(resolveNodeApprovers(n, form(100), org())).toEqual(['mgr']);
  });

  it('groupJobLevel：限申請人所在組 × 職等', () => {
    const n = userTask('t', { mode: 'groupJobLevel', jobLevelIds: ['j-dir'] });
    expect(resolveNodeApprovers(n, form(100), org())).toEqual(['dir']);
  });

  it('orgHierarchy：向上追溯到 rank 達標的主管', () => {
    expect(
      resolveNodeApprovers(userTask('t', { mode: 'orgHierarchy', minJobLevelRank: 50 }), form(100), org()),
    ).toEqual(['dir']);
    expect(
      resolveNodeApprovers(userTask('t', { mode: 'orgHierarchy', minJobLevelRank: 40 }), form(100), org()),
    ).toEqual(['mgr']);
  });

  it('找不到主要核准人時套用 fallback', () => {
    // 申請人無直屬主管時，fallback 到 byJobLevel
    const noSupForm = { ...form(100), requesterId: 'dir' };
    const n = userTask('t', { mode: 'directSupervisor', fallback: 'byJobLevel', jobLevelIds: ['j-dir'] });
    expect(resolveNodeApprovers(n, noSupForm, org())).toEqual(['dir']);
  });
});

describe('resolvePath', () => {
  const process: BpmnProcess = {
    id: 'p', name: '報銷', description: '', category: '', status: 'active', version: 1,
    approvalThresholds: [], createdAt: '', updatedAt: '',
    nodes: [
      node('start', 'bpmnStart'),
      node('gw', 'bpmnExclusiveGateway', { defaultEdgeId: 'e-low' }),
      node('high', 'bpmnUserTask'),
      node('low', 'bpmnUserTask'),
      node('end', 'bpmnEnd'),
    ],
    edges: [
      edge('e-start', 'start', 'gw'),
      edge('e-high', 'gw', 'high', { variable: 'amount', operator: '>', value: 1000 }),
      edge('e-low', 'gw', 'low', { variable: 'amount', operator: '<=', value: 1000 }),
      edge('e-h-end', 'high', 'end'),
      edge('e-l-end', 'low', 'end'),
    ],
  };

  it('閘道依條件走高額路徑', () => {
    expect(resolvePath(process, { amount: 5000 })).toEqual(['start', 'gw', 'high', 'end']);
  });

  it('閘道依條件走低額路徑', () => {
    expect(resolvePath(process, { amount: 100 })).toEqual(['start', 'gw', 'low', 'end']);
  });

  it('無 start 節點回空陣列', () => {
    expect(resolvePath({ ...process, nodes: process.nodes.filter((n) => n.type !== 'bpmnStart') }, {})).toEqual([]);
  });
});

describe('createSimulationSession', () => {
  it('產生 resolvedPath 並預解析 userTask 核准人', () => {
    const process: BpmnProcess = {
      id: 'p', name: '報銷', description: '', category: '', status: 'active', version: 1,
      approvalThresholds: [], createdAt: '', updatedAt: '',
      nodes: [
        node('start', 'bpmnStart'),
        userTask('approve', { mode: 'directSupervisor' }),
        node('end', 'bpmnEnd'),
      ],
      edges: [edge('e1', 'start', 'approve'), edge('e2', 'approve', 'end')],
    };
    const session = createSimulationSession(process, form(100), org());
    expect(session.resolvedPath).toEqual(['start', 'approve', 'end']);
    expect(session.resolvedApprovers.approve).toEqual(['mgr']);
    expect(session.status).toBe('running');
    expect(session.orgContext.requesterName).toBe('req');
  });
});

describe('advanceSession', () => {
  const process: BpmnProcess = {
    id: 'p', name: '報銷', description: '', category: '', status: 'active', version: 1,
    approvalThresholds: [], createdAt: '', updatedAt: '',
    nodes: [node('s', 'bpmnStart'), userTask('t', { mode: 'directSupervisor' }), node('e', 'bpmnEnd')],
    edges: [],
  };
  const base: SimulationSession = {
    id: 's', processId: 'p', processName: '報銷', formData: form(100),
    resolvedPath: ['s', 't', 'e'], resolvedApprovers: {}, currentStep: 0,
    orgContext: {} as SimulationSession['orgContext'], logs: [], status: 'running', startedAt: '',
  };

  it('核准會前進一步並記錄 log', () => {
    const next = advanceSession(base, process, 'approved');
    expect(next.currentStep).toBe(1);
    expect(next.status).toBe('running');
    expect(next.logs).toHaveLength(1);
  });

  it('走到最後一步狀態變 approved', () => {
    const atLast = advanceSession({ ...base, currentStep: 2 }, process, 'approved');
    expect(atLast.status).toBe('approved');
    expect(atLast.completedAt).toBeDefined();
  });

  it('駁回直接結束', () => {
    const rejected = advanceSession(base, process, 'rejected');
    expect(rejected.status).toBe('rejected');
  });
});
