import { createContext } from 'react';
import type { DataVersionInfo } from '../services/dataVersions';
import type { Assignment, Employee, Group, OrgData } from '../types/org';

export interface OrgContextValue {
  data: OrgData;
  dataVersions: DataVersionInfo[];
  activeVersionId: string;
  activeVersion: DataVersionInfo | undefined;
  selectDataVersion: (id: string) => void;
  /** 發布草稿為新的本機版本（可選填版本名稱、調整理由、生效日 YYYY-MM-DD），回傳新版本 id */
  publishVersion: (
    draft: OrgData,
    opts?: { label?: string; note?: string; effectiveDate?: string },
  ) => string;
  /** 刪除一個本機發布版本（內建版本不受影響） */
  deletePublishedVersion: (id: string) => void;
  /** 將所有本機發布版本匯出成可攜帶的整包檔 */
  exportPublishedVersions: () => void;
  /** 從整包檔匯入發布版本（合併、去重），回傳錯誤訊息或 null */
  importPublishedVersions: (raw: unknown) => string | null;
  operator: string;
  setOperator: (name: string) => void;
  saveEmployee: (employee: Employee, isNew: boolean) => string | null;
  removeEmployee: (id: string) => void;
  saveGroup: (group: Group, isNew: boolean) => string | null;
  saveAssignment: (assignment: Assignment, isNew: boolean) => string | null;
  removeAssignment: (id: string) => void;
  newAssignmentFor: (employeeId: string) => Assignment;
  loadFromFile: (data: OrgData) => void;
  exportData: (filename?: string) => void;
  applyChange: (
    mutate: (current: OrgData) => { data: OrgData; error?: string },
    onSuccess?: () => void,
  ) => string | null;
}

export const OrgContext = createContext<OrgContextValue | null>(null);
