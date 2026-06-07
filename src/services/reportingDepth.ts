import type { Assignment } from '../types/org';

/**
 * 計算每位員工的「主匯報深度」（1-indexed），作為組織層級的單一真實來源。
 *
 * 與 `assignmentLevels.groupReportingDepth` 的差異：
 * - **只走主匯報（`primarySupervisorId`），完全忽略 `supervisorIds` 裡的虛線/次要主管**，
 *   避免矩陣式虛線匯報污染層級（同一員工可能掛多個主管）。
 * - 以員工為單位、跨組視為同一視角：每位員工的「正規父」= 其**顯示歸屬**
 *   （`isPrimaryGroup` 優先、否則第一筆，與 `buildOrgFlowGraph.pickDisplayAssignment` 一致）
 *   的 `primarySupervisorId`。
 *
 * 範圍 = 傳入的 assignment 集合（即「目前視角」：全公司＝全部 active 組別歸屬；單組＝該組歸屬）。
 * 父為 null 或父的 employeeId 不在傳入集合內 → 該員工為根，depth = 1；否則 depth = 父 depth + 1。
 *
 * @returns Map<employeeId, depth>
 */
export function computePrimaryDepth(
  assignments: Assignment[],
): Map<string, number> {
  // 每位員工的顯示歸屬（isPrimaryGroup 優先、否則第一筆）。
  const displayByEmployee = new Map<string, Assignment>();
  for (const a of assignments) {
    const existing = displayByEmployee.get(a.employeeId);
    if (!existing) {
      displayByEmployee.set(a.employeeId, a);
    } else if (!existing.isPrimaryGroup && a.isPrimaryGroup) {
      displayByEmployee.set(a.employeeId, a);
    }
  }

  const inScope = new Set(displayByEmployee.keys());
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const calc = (eid: string): number => {
    const cached = depth.get(eid);
    if (cached != null) return cached;
    if (visiting.has(eid)) return 1; // 防環（理論上已被 validators 擋掉）
    visiting.add(eid);

    const display = displayByEmployee.get(eid);
    const parentId = display?.primarySupervisorId ?? null;
    // 父為 null 或父不在視角內 → 根；否則父深度 + 1（只走主匯報）。
    const d =
      parentId == null || !inScope.has(parentId) ? 1 : calc(parentId) + 1;

    visiting.delete(eid);
    depth.set(eid, d);
    return d;
  };

  for (const eid of inScope) calc(eid);
  return depth;
}

/**
 * 取得一筆歸屬的「有效層級」：手動覆寫優先，否則用計算的主匯報深度。
 *
 * `assignment.level` 為稀疏的「層級覆寫」（使用者刻意垂直拖曳時設值）；
 * 預設由 `computePrimaryDepth` 自動計算。
 */
export function effectiveLevel(
  assignment: Assignment,
  depthMap: Map<string, number>,
): number {
  return assignment.level ?? depthMap.get(assignment.employeeId) ?? 1;
}
