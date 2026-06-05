export type EntityStatus = 'active' | 'inactive';

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
  version: number;
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
