export type EntityStatus = 'active' | 'inactive';

/** 組別種類：department=階層部門（匯報線，走 parentId）；function=跨部門專案職能 */
export type GroupKind = 'department' | 'function';

export interface Employee {
  id: string;
  employeeNo: string;
  name: string;
  status: EntityStatus;
}

export interface Group {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  status: EntityStatus;
  /** 組別種類；migration 回填舊資料為 'department'，新表單必填。 */
  kind: GroupKind;
}

export interface JobLevel {
  id: string;
  code: string;
  name: string;
  rank: number;
}

export interface Assignment {
  id: string;
  employeeId: string;
  groupId: string;
  jobLevelId: string;
  supervisorIds: string[];
  primarySupervisorId: string | null;
  isPrimaryGroup: boolean;
  /** 組織層級（1-indexed 匯報層）；組織圖以此判斷垂直層級，可拖拉改動 */
  level?: number;
}

export type ChangeType =
  | 'employee_create'
  | 'employee_update'
  | 'employee_delete'
  | 'group_create'
  | 'group_update'
  | 'group_delete'
  | 'assignment_create'
  | 'assignment_update'
  | 'assignment_delete'
  | 'import';

export interface ChangeEntry {
  id: string;
  timestamp: string;
  operator: string;
  changeType: ChangeType;
  summary: string;
  before?: string;
  after?: string;
}

export interface OrgData {
  /** 資料**結構** schema 版本（migration 用），與下方 `contentVersion`（內容版本）不同。 */
  schemaVersion: number;
  /** 使用者面的內容版本（發布時遞增），非 schema 版本。 */
  contentVersion: number;
  exportedAt: string;
  employees: Employee[];
  groups: Group[];
  jobLevels: JobLevel[];
  assignments: Assignment[];
  changeLog: ChangeEntry[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
