import type { ChangeType } from '../types/org';

/**
 * ChangeType → 中文標籤對照（單一真相來源）。
 *
 * 供「調整紀錄」頁與編輯介面的「異動歷程面板（操作流水）」共用，避免兩處各自維護。
 */
export const changeTypeLabels: Record<ChangeType, string> = {
  employee_create: '新增員工',
  employee_update: '更新員工',
  employee_delete: '刪除員工',
  group_create: '新增組別',
  group_update: '更新組別',
  group_delete: '刪除組別',
  assignment_create: '新增歸屬',
  assignment_update: '更新歸屬',
  assignment_delete: '刪除歸屬',
  import: '匯入資料',
};

/** 取 changeType 的中文標籤；未知類型回退原始字串。 */
export function changeTypeLabel(changeType: string): string {
  return changeTypeLabels[changeType as ChangeType] ?? changeType;
}
