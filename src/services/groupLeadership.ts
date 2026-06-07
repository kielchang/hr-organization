import type { Group, OrgData } from '../types/org';
import { computePrimaryDepth } from './reportingDepth';

/**
 * 一個組別的領導結構推導結果。
 * - `leaderId`：組長（employeeId）；可 null＝該組無成員或無法推得。
 * - `coLeaderIds`：推導式平行共管（co-leader）——組內成員的主管落在組外者，
 *   與組長同層共管（例：業務部 CEO 為組長、COO 帶部分成員→COO 為 co-leader）。
 */
export interface GroupLeadership {
  groupId: string;
  leaderId: string | null;
  coLeaderIds: string[];
}

/**
 * 判定某員工是否「夠格（lead-level）」當組外共管。
 *
 * 成立任一即夠格：
 * - (a) 其**主歸屬 assignment**（isPrimaryGroup 優先、否則第一筆）的
 *   `primarySupervisorId` 為 null（無上級主管）；或
 * - (b) 其為**某 group 的 `leaderId`**。
 *
 * 不夠格者（有上級主管且非任何組長）視為「掛錯組」，不列入 co-leader。
 */
export function isLeadLevel(data: OrgData, employeeId: string): boolean {
  if (data.groups.some((g) => g.leaderId === employeeId)) return true; // (b)
  const own = data.assignments.filter((a) => a.employeeId === employeeId);
  if (own.length === 0) return false;
  const primary = own.find((a) => a.isPrimaryGroup) ?? own[0];
  return primary.primarySupervisorId == null; // (a)
}

/** 取得某組的成員集合（該組所有 assignment 的 employeeId）。 */
function groupMemberIds(data: OrgData, groupId: string): Set<string> {
  return new Set(
    data.assignments
      .filter((a) => a.groupId === groupId)
      .map((a) => a.employeeId),
  );
}

/**
 * 推導某組的「組內匯報根」當作回退組長。
 *
 * 候選 = 成員集合 M 中，其「在本組那筆 assignment」的 `primarySupervisorId` 為 null、
 * 或該主管不在 M（主管在組外）者。Deterministic tiebreak：
 *   1. 組內有效層級最高（`computePrimaryDepth(該組 assignments)` 深度最小）
 *   2. 平手取組內直接部屬數最多
 *   3. 再平手取 employeeId 升冪第一
 *
 * @returns 推得的組長 employeeId；無成員或無候選 → null。
 */
export function deriveInGroupRoot(data: OrgData, groupId: string): string | null {
  const groupAssignments = data.assignments.filter((a) => a.groupId === groupId);
  const memberIds = new Set(groupAssignments.map((a) => a.employeeId));
  if (memberIds.size === 0) return null;

  // 每位成員在本組的那筆 assignment（同一員工在同組理論上唯一；取第一筆穩定）。
  const assignmentByMember = new Map<string, (typeof groupAssignments)[number]>();
  for (const a of groupAssignments) {
    if (!assignmentByMember.has(a.employeeId)) assignmentByMember.set(a.employeeId, a);
  }

  // 候選：主管為 null 或主管在組外。
  const candidates = [...memberIds].filter((eid) => {
    const sup = assignmentByMember.get(eid)?.primarySupervisorId ?? null;
    return sup == null || !memberIds.has(sup);
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // tiebreak 1：組內有效層級最高（組內深度最小）。
  const depth = computePrimaryDepth(groupAssignments);

  // tiebreak 2：組內直接部屬數（其主管為該員、且部屬也在組內）。
  const inGroupReportCount = new Map<string, number>();
  for (const a of groupAssignments) {
    const sup = a.primarySupervisorId;
    if (sup != null && memberIds.has(sup)) {
      inGroupReportCount.set(sup, (inGroupReportCount.get(sup) ?? 0) + 1);
    }
  }

  return [...candidates].sort((x, y) => {
    const dx = depth.get(x) ?? Number.POSITIVE_INFINITY;
    const dy = depth.get(y) ?? Number.POSITIVE_INFINITY;
    if (dx !== dy) return dx - dy; // 深度小＝層級高，優先
    const rx = inGroupReportCount.get(x) ?? 0;
    const ry = inGroupReportCount.get(y) ?? 0;
    if (rx !== ry) return ry - rx; // 部屬多者優先
    return x < y ? -1 : x > y ? 1 : 0; // employeeId 升冪
  })[0];
}

/**
 * 推導單一組別的領導結構（leader + 推導式 co-leader）。
 *
 * - `leaderId`：優先取 `group.leaderId`；未設（null/undefined）時即時回退推「組內匯報根」。
 * - `coLeaderIds`：對每位成員看其「在本組那筆 assignment」的 `primarySupervisorId = s`，
 *   若 `s != null && s != leaderId && s ∉ M`（主管在組外）**且 `isLeadLevel(s)`（夠格）**
 *   → s 為 co-leader 候選；不夠格者屬「掛錯組」（由 Phase F 報警示），不列入。
 *   去重、排除 leaderId、回 employeeId 升冪的穩定排序陣列。
 * - 空組（無成員）→ `{ groupId, leaderId: null, coLeaderIds: [] }`。
 */
export function deriveGroupLeadership(
  data: OrgData,
  group: Group,
): GroupLeadership {
  const memberIds = groupMemberIds(data, group.id);
  if (memberIds.size === 0) {
    return { groupId: group.id, leaderId: null, coLeaderIds: [] };
  }

  const leaderId =
    group.leaderId != null ? group.leaderId : deriveInGroupRoot(data, group.id);

  const coLeaderSet = new Set<string>();
  for (const a of data.assignments) {
    if (a.groupId !== group.id) continue;
    const sup = a.primarySupervisorId;
    if (
      sup != null &&
      sup !== leaderId &&
      !memberIds.has(sup) &&
      isLeadLevel(data, sup)
    ) {
      coLeaderSet.add(sup);
    }
  }

  const coLeaderIds = [...coLeaderSet].sort((x, y) =>
    x < y ? -1 : x > y ? 1 : 0,
  );

  return { groupId: group.id, leaderId, coLeaderIds };
}

/** 推導所有組別的領導結構，回 Map<groupId, GroupLeadership>。 */
export function deriveAllGroupLeadership(
  data: OrgData,
): Map<string, GroupLeadership> {
  const result = new Map<string, GroupLeadership>();
  for (const group of data.groups) {
    result.set(group.id, deriveGroupLeadership(data, group));
  }
  return result;
}
