import type { Assignment, OrgData } from '../types/org';

/** 在單一組別內，依組內主管關係計算每個員工的匯報深度（1-indexed） */
function groupReportingDepth(assignments: Assignment[]): Map<string, number> {
  const inGroup = new Set(assignments.map((a) => a.employeeId));
  const supById = new Map<string, string[]>();
  for (const a of assignments) {
    supById.set(
      a.employeeId,
      a.supervisorIds.filter((s) => inGroup.has(s)),
    );
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const calc = (eid: string): number => {
    const cached = depth.get(eid);
    if (cached != null) return cached;
    if (visiting.has(eid)) return 1; // 防環（理論上已被驗證擋掉）
    visiting.add(eid);
    const sups = supById.get(eid) ?? [];
    const d = sups.length === 0 ? 1 : Math.max(...sups.map(calc)) + 1;
    visiting.delete(eid);
    depth.set(eid, d);
    return d;
  };

  for (const a of assignments) calc(a.employeeId);
  return depth;
}

/**
 * 為缺少 `level` 的 assignment 以「組內匯報深度」補初始值。
 * 已有 level 的不動。回傳新的 OrgData（不可變）。
 */
export function backfillAssignmentLevels(data: OrgData): OrgData {
  if (!data.assignments.some((a) => a.level == null)) return data;

  const byGroup = new Map<string, Assignment[]>();
  for (const a of data.assignments) {
    const arr = byGroup.get(a.groupId) ?? [];
    arr.push(a);
    byGroup.set(a.groupId, arr);
  }

  const depthByGroup = new Map<string, Map<string, number>>();
  for (const [gid, arr] of byGroup) {
    depthByGroup.set(gid, groupReportingDepth(arr));
  }

  const assignments = data.assignments.map((a) =>
    a.level != null
      ? a
      : { ...a, level: depthByGroup.get(a.groupId)?.get(a.employeeId) ?? 1 },
  );

  return { ...data, assignments };
}
