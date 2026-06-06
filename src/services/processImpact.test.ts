import { analyzeProcessHealth, diffProcessImpact } from './processImpact';
import type { BpmnFlowNode, BpmnProcess } from '../types/bpmn';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

function approveProcess(node: BpmnFlowNode): BpmnProcess {
  return {
    id: 'p', name: '報銷', description: '', category: '', status: 'active', version: 1,
    approvalThresholds: [], createdAt: '', updatedAt: '',
    nodes: [
      { id: 'start', type: 'bpmnStart', position: { x: 0, y: 0 }, data: { label: 'start' } },
      node,
      { id: 'end', type: 'bpmnEnd', position: { x: 0, y: 0 }, data: { label: 'end' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: node.id },
      { id: 'e2', source: node.id, target: 'end' },
    ],
  };
}

const directSupNode: BpmnFlowNode = {
  id: 'approve', type: 'bpmnUserTask', position: { x: 0, y: 0 },
  data: { label: '主管核准', approverResolution: { mode: 'directSupervisor' } },
};
const byLevelNode = (jobLevelIds: string[]): BpmnFlowNode => ({
  id: 'approve', type: 'bpmnUserTask', position: { x: 0, y: 0 },
  data: { label: '職等核准', approverResolution: { mode: 'byJobLevel', jobLevelIds } },
});

describe('analyzeProcessHealth', () => {
  it('有人找不到核准人 → critical', () => {
    const org = makeOrgData({
      employees: [emp('solo'), emp('staff'), emp('mgr')],
      groups: [group('g1')],
      assignments: [
        assignment('a-solo', { employeeId: 'solo', groupId: 'g1' }), // 無主管
        assignment('a-staff', { employeeId: 'staff', groupId: 'g1', supervisorIds: ['mgr'], primarySupervisorId: 'mgr' }),
        assignment('a-mgr', { employeeId: 'mgr', groupId: 'g1' }),
      ],
    });
    const health = analyzeProcessHealth(approveProcess(directSupNode), org);
    expect(health.severity).toBe('critical');
    expect(health.nodes[0].brokenRequesters.length).toBeGreaterThan(0);
  });

  it('每人都只有單一核准人 → warning (SPOF)', () => {
    const org = makeOrgData({
      employees: [emp('a'), emp('b'), emp('mgr')],
      groups: [group('g1')],
      jobLevels: [jobLevel('j-mgr', 40)],
      assignments: [
        assignment('a-a', { employeeId: 'a', groupId: 'g1', jobLevelId: 'j-staff' }),
        assignment('a-b', { employeeId: 'b', groupId: 'g1', jobLevelId: 'j-staff' }),
        assignment('a-mgr', { employeeId: 'mgr', groupId: 'g1', jobLevelId: 'j-mgr' }),
      ],
    });
    const health = analyzeProcessHealth(approveProcess(byLevelNode(['j-mgr'])), org);
    expect(health.severity).toBe('warning');
    expect(health.nodes[0].brokenRequesters).toEqual([]);
    expect(health.nodes[0].spofRequesters.length).toBeGreaterThan(0);
  });

  it('核准人足夠 → ok', () => {
    const org = makeOrgData({
      employees: [emp('a'), emp('m1'), emp('m2')],
      groups: [group('g1')],
      jobLevels: [jobLevel('j-mgr', 40)],
      assignments: [
        assignment('a-a', { employeeId: 'a', groupId: 'g1', jobLevelId: 'j-staff' }),
        assignment('a-m1', { employeeId: 'm1', groupId: 'g1', jobLevelId: 'j-mgr' }),
        assignment('a-m2', { employeeId: 'm2', groupId: 'g1', jobLevelId: 'j-mgr' }),
      ],
    });
    const health = analyzeProcessHealth(approveProcess(byLevelNode(['j-mgr'])), org);
    expect(health.severity).toBe('ok');
  });
});

describe('diffProcessImpact', () => {
  const baseline = makeOrgData({
    employees: [emp('staff'), emp('mgr')],
    groups: [group('g1')],
    assignments: [
      assignment('a-staff', { employeeId: 'staff', groupId: 'g1', supervisorIds: ['mgr'], primarySupervisorId: 'mgr' }),
      assignment('a-mgr', { employeeId: 'mgr', groupId: 'g1' }),
    ],
  });

  it('組織未變 → 無影響 (none)', () => {
    const impact = diffProcessImpact(approveProcess(directSupNode), baseline, baseline);
    expect(impact.severity).toBe('none');
    expect(impact.affectedScenarios).toEqual([]);
  });

  it('主管被移除導致關卡斷鏈 → critical', () => {
    const target = makeOrgData({
      employees: [emp('staff'), emp('mgr')],
      groups: [group('g1')],
      assignments: [
        assignment('a-staff', { employeeId: 'staff', groupId: 'g1' }), // 主管被拔掉
        assignment('a-mgr', { employeeId: 'mgr', groupId: 'g1' }),
      ],
    });
    const impact = diffProcessImpact(approveProcess(directSupNode), baseline, target);
    expect(impact.severity).toBe('critical');
    expect(impact.affectedRequesterIds).toContain('staff');
    expect(impact.affectedNodeIds).toContain('approve');
  });
});
