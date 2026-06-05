import type { OrgData } from '../types/org';
import type { NodeDiffStatus, OrgDiffResult } from '../types/editSession';

function edgeKeysFromOrgData(data: OrgData): Set<string> {
  const keys = new Set<string>();
  for (const a of data.assignments) {
    for (const supId of a.supervisorIds) {
      keys.add(`${supId}->${a.employeeId}`);
    }
  }
  return keys;
}

export function computeOrgDiff(base: OrgData, current: OrgData): OrgDiffResult {
  const baseEmpIds = new Set(base.employees.map((e) => e.id));
  const currEmpIds = new Set(current.employees.map((e) => e.id));
  const baseEmpMap = new Map(base.employees.map((e) => [e.id, JSON.stringify(e)]));
  const currEmpMap = new Map(current.employees.map((e) => [e.id, JSON.stringify(e)]));

  const addedEmployeeIds = new Set<string>();
  const removedEmployeeIds = new Set<string>();
  const modifiedEmployeeIds = new Set<string>();

  for (const id of currEmpIds) {
    if (!baseEmpIds.has(id)) {
      addedEmployeeIds.add(id);
    } else if (baseEmpMap.get(id) !== currEmpMap.get(id)) {
      modifiedEmployeeIds.add(id);
    }
  }
  for (const id of baseEmpIds) {
    if (!currEmpIds.has(id)) removedEmployeeIds.add(id);
  }

  const baseAssIds = new Set(base.assignments.map((a) => a.id));
  const currAssIds = new Set(current.assignments.map((a) => a.id));
  const baseAssMap = new Map(base.assignments.map((a) => [a.id, JSON.stringify(a)]));
  const currAssMap = new Map(current.assignments.map((a) => [a.id, JSON.stringify(a)]));

  const addedAssignmentIds = new Set<string>();
  const removedAssignmentIds = new Set<string>();
  const modifiedAssignmentIds = new Set<string>();

  for (const id of currAssIds) {
    if (!baseAssIds.has(id)) {
      addedAssignmentIds.add(id);
    } else if (baseAssMap.get(id) !== currAssMap.get(id)) {
      modifiedAssignmentIds.add(id);
    }
  }
  for (const id of baseAssIds) {
    if (!currAssIds.has(id)) removedAssignmentIds.add(id);
  }

  const baseEdgeKeys = edgeKeysFromOrgData(base);
  const currEdgeKeys = edgeKeysFromOrgData(current);

  const addedEdgeKeys = new Set<string>();
  const removedEdgeKeys = new Set<string>();
  for (const k of currEdgeKeys) {
    if (!baseEdgeKeys.has(k)) addedEdgeKeys.add(k);
  }
  for (const k of baseEdgeKeys) {
    if (!currEdgeKeys.has(k)) removedEdgeKeys.add(k);
  }

  return {
    addedEmployeeIds,
    removedEmployeeIds,
    modifiedEmployeeIds,
    addedAssignmentIds,
    removedAssignmentIds,
    modifiedAssignmentIds,
    addedEdgeKeys,
    removedEdgeKeys,
  };
}

export function buildNodeDiffMap(
  diff: OrgDiffResult,
  nodeIds: string[],
): Map<string, NodeDiffStatus> {
  const map = new Map<string, NodeDiffStatus>();
  for (const id of nodeIds) {
    if (diff.addedEmployeeIds.has(id)) {
      map.set(id, 'added');
    } else if (diff.removedEmployeeIds.has(id)) {
      map.set(id, 'removed');
    } else if (diff.modifiedEmployeeIds.has(id)) {
      map.set(id, 'modified');
    } else {
      map.set(id, 'unchanged');
    }
  }
  return map;
}
