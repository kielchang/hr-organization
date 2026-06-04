import { createContext } from 'react';
import type { DataVersionInfo } from '../services/dataVersions';
import type { Assignment, Employee, Group, OrgData } from '../types/org';

export interface OrgContextValue {
  data: OrgData;
  dataVersions: DataVersionInfo[];
  activeVersionId: string;
  activeVersion: DataVersionInfo | undefined;
  selectDataVersion: (id: string) => void;
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
