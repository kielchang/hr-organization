import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { downloadOrgData } from '../services/exportImport';
import {
  createEmptyAssignment,
  deleteAssignment,
  deleteEmployee,
  importOrgData,
  upsertAssignment,
  upsertEmployee,
  upsertGroup,
} from '../services/orgOperations';
import { cloneOrgData } from '../services/exportImport';
import { backfillAssignmentLevels } from '../services/assignmentLevels';
import {
  loadDataVersions,
  pickDefaultVersionId,
  type DataVersionInfo,
} from '../services/dataVersions';
import type { Assignment, Employee, Group, OrgData } from '../types/org';
import { OrgContext, type OrgContextValue } from './orgContextState';

const emptyOrgData: OrgData = {
  version: 1,
  exportedAt: new Date().toISOString(),
  employees: [],
  groups: [],
  jobLevels: [],
  assignments: [],
  changeLog: [],
};

const DRAFT_STORAGE_KEY = 'hr-org-draft';

function saveDraft(data: OrgData) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadDraft(): OrgData | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OrgData;
  } catch {
    return null;
  }
}

function createInitialState(): {
  dataVersions: DataVersionInfo[];
  activeVersionId: string;
  data: OrgData;
} {
  const dataVersions = loadDataVersions();
  const activeVersionId = pickDefaultVersionId(dataVersions);
  const version = dataVersions.find((v) => v.id === activeVersionId);
  const seedData = cloneOrgData(version?.data ?? emptyOrgData);
  const draft = loadDraft();
  return {
    dataVersions,
    activeVersionId,
    data: backfillAssignmentLevels(draft ?? seedData),
  };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(createInitialState);
  const [dataVersions] = useState(() => initial.dataVersions);
  const [activeVersionId, setActiveVersionId] = useState(
    () => initial.activeVersionId,
  );
  const [data, setData] = useState<OrgData>(() => initial.data);
  const [operator, setOperator] = useState('HR User');

  const activeVersion = useMemo(
    () => dataVersions.find((v) => v.id === activeVersionId),
    [dataVersions, activeVersionId],
  );

  const selectDataVersion = useCallback(
    (id: string) => {
      const version = dataVersions.find((v) => v.id === id);
      if (!version) return;
      setActiveVersionId(id);
      setData(backfillAssignmentLevels(cloneOrgData(version.data)));
    },
    [dataVersions],
  );

  const commit = useCallback(
    (next: OrgData) => {
      setData(next);
      saveDraft(next);
    },
    [],
  );

  const applyChange = useCallback<OrgContextValue['applyChange']>(
    (mutate, onSuccess) => {
      const result = mutate(data);
      if (result.error) return result.error;
      commit(result.data);
      onSuccess?.();
      return null;
    },
    [data, commit],
  );

  const saveEmployee = useCallback(
    (employee: Employee, isNew: boolean) => {
      const result = upsertEmployee(data, employee, operator, isNew);
      if (result.error) return result.error;
      commit(result.data);
      return null;
    },
    [data, operator, commit],
  );

  const removeEmployee = useCallback(
    (id: string) => {
      commit(deleteEmployee(data, id, operator));
    },
    [data, operator, commit],
  );

  const saveGroup = useCallback(
    (group: Group, isNew: boolean) => {
      const result = upsertGroup(data, group, operator, isNew);
      if (result.error) return result.error;
      commit(result.data);
      return null;
    },
    [data, operator, commit],
  );

  const saveAssignment = useCallback(
    (assignment: Assignment, isNew: boolean) => {
      const result = upsertAssignment(data, assignment, operator, isNew);
      if (result.error) return result.error;
      commit(result.data);
      return null;
    },
    [data, operator, commit],
  );

  const removeAssignment = useCallback(
    (id: string) => {
      commit(deleteAssignment(data, id, operator));
    },
    [data, operator, commit],
  );

  const loadFromFile = useCallback(
    (incoming: OrgData) => {
      const next = backfillAssignmentLevels(importOrgData(incoming, operator));
      setData(next);
      saveDraft(next);
    },
    [operator],
  );

  const exportData = useCallback((filename?: string) => {
    downloadOrgData(data, filename);
  }, [data]);

  const value = useMemo<OrgContextValue>(
    () => ({
      data,
      dataVersions,
      activeVersionId,
      activeVersion,
      selectDataVersion,
      operator,
      setOperator,
      saveEmployee,
      removeEmployee,
      saveGroup,
      saveAssignment,
      removeAssignment,
      newAssignmentFor: createEmptyAssignment,
      loadFromFile,
      exportData,
      applyChange,
    }),
    [
      data,
      dataVersions,
      activeVersionId,
      activeVersion,
      selectDataVersion,
      operator,
      saveEmployee,
      removeEmployee,
      saveGroup,
      saveAssignment,
      removeAssignment,
      loadFromFile,
      exportData,
      applyChange,
    ],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
