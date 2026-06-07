import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';

/** 群組選擇所需的最小欄位（id + status），避免綁死完整 Group 型別。 */
type GroupLike = { id: string; status: string };

/**
 * 預設選定組別：優先「前端組」(g4)，否則第一個 active 組，皆無則全公司視角。
 *
 * 由 OrgChartPage 與 WorkbenchPage 共用（兩頁原本各自複製一份完全相同的實作）。
 */
export function pickDefaultGroupId(groups: GroupLike[]): string {
  const active = groups.filter((g) => g.status === 'active');
  return active.find((g) => g.id === 'g4')?.id ?? active[0]?.id ?? ALL_GROUPS_VIEW_ID;
}

/**
 * 將目前 groupId 解析為「仍然有效」的選定值：
 * 全公司視角原樣保留；指向已不存在／已停用組別時回退到預設組。
 */
export function resolveGroupId(groupId: string, groups: GroupLike[]): string {
  if (groupId === ALL_GROUPS_VIEW_ID) return ALL_GROUPS_VIEW_ID;
  const active = groups.filter((g) => g.status === 'active');
  if (active.some((g) => g.id === groupId)) return groupId;
  return pickDefaultGroupId(groups);
}
