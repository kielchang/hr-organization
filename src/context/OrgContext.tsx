import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
import {
  loadDataVersions,
  pickDefaultVersionId,
  type DataVersionInfo,
} from '../services/dataVersions';
import type { Assignment, Employee, Group, OrgData } from '../types/org';

const emptyOrgData: OrgData = {
  version: 1,
  exportedAt: new Date().toISOString(),
  employees: [],
  groups: [],
  jobLevels: [],
  assignments: [],
  changeLog: [],
};

function createInitialState(): {
  dataVersions: DataVersionInfo[];
  activeVersionId: string;
  data: OrgData;
} {
  const dataVersions = loadDataVersions();
  const activeVersionId = pickDefaultVersionId(dataVersions);
  const version = dataVersions.find((v) => v.id === activeVersionId);
  return {
    dataVersions,
    activeVersionId,
    data: cloneOrgData(version?.data ?? emptyOrgData),
  };
}

interface OrgContextValue {
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
  applyChange: (mutate: (current: OrgData) => { data: OrgData; error?: string }, onSuccess?: () => void) => string | null;
}

const OrgContext = createContext<OrgContextValue | null>(null);

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
      setData(cloneOrgData(version.data));
    },
    [dataVersions],
  );

  const commit = useCallback(
    (next: OrgData, autoExport = true) => {
      setData(next);
      if (autoExport) downloadOrgData(next);
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
      const next = importOrgData(incoming, operator);
      setData(next);
      downloadOrgData(next);
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

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
