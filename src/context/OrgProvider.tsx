import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { downloadOrgData, downloadJson } from '../services/exportImport';
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
import { ORG_SCHEMA_VERSION, migrateOrgData } from '../services/migrations/orgMigrations';
import { safeSetItem } from '../services/storage';
import {
  apiVersionToInfo,
  loadDataVersions,
  pickDefaultVersionId,
  publishedVersionToInfo,
  type DataVersionInfo,
} from '../services/dataVersions';
import { apiClient, isApiEnabled } from '../services/apiClient';
import {
  addPublishedVersion,
  buildPublishedBundle,
  deletePublishedVersion as deletePublishedVersionStorage,
  loadPublishedVersions,
  mergePublishedBundle,
} from '../services/publishedVersions';
import type { Assignment, Employee, Group, OrgData } from '../types/org';
import { OrgContext, type OrgContextValue } from './orgContextState';

const emptyOrgData: OrgData = {
  schemaVersion: ORG_SCHEMA_VERSION,
  contentVersion: 1,
  exportedAt: new Date().toISOString(),
  employees: [],
  groups: [],
  jobLevels: [],
  assignments: [],
  changeLog: [],
};

const DRAFT_STORAGE_KEY = 'hr-org-draft';
const ACTIVE_VERSION_KEY = 'hr-org-active-version';

function saveDraft(data: OrgData) {
  safeSetItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
}

function loadDraft(): OrgData | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    // 舊草稿可能缺 schemaVersion，載入時升級到目前結構。
    return migrateOrgData(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveActiveVersionId(id: string) {
  safeSetItem(ACTIVE_VERSION_KEY, id);
}

function loadActiveVersionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_VERSION_KEY);
  } catch {
    return null;
  }
}

/** 內建版本（seed + mock）＋本機發布版本，發布版本排在內建之後。 */
function loadAllVersions(): DataVersionInfo[] {
  const builtIn = loadDataVersions();
  const published = loadPublishedVersions().map(publishedVersionToInfo);
  return [...builtIn, ...published];
}

function createInitialState(): {
  dataVersions: DataVersionInfo[];
  activeVersionId: string;
  data: OrgData;
} {
  const dataVersions = loadAllVersions();
  // 還原上次選擇的版本（若仍存在），否則用預設（初始）。
  const savedId = loadActiveVersionId();
  const activeVersionId =
    savedId && dataVersions.some((v) => v.id === savedId)
      ? savedId
      : pickDefaultVersionId(dataVersions);
  const version = dataVersions.find((v) => v.id === activeVersionId);
  const versionData = cloneOrgData(version?.data ?? emptyOrgData);
  // draft 代表「該版本上的工作狀態」，僅在 draft 屬於目前 active 版本時沿用，
  // 避免下拉顯示 A 版本卻載入 B 版本內容的不一致。
  const draft = loadDraft();
  const draftBelongsToActive = savedId === activeVersionId && draft != null;
  // 確立 active 版本，讓後續手動編輯存入的 draft 能在重整後被視為屬於此版本
  saveActiveVersionId(activeVersionId);
  return {
    dataVersions,
    activeVersionId,
    data: backfillAssignmentLevels(draftBelongsToActive ? draft : versionData),
  };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(createInitialState);
  const [dataVersions, setDataVersions] = useState(() => initial.dataVersions);
  const [activeVersionId, setActiveVersionId] = useState(
    () => initial.activeVersionId,
  );
  const [data, setData] = useState<OrgData>(() => initial.data);
  const [operator, setOperator] = useState('HR User');
  // 雲端（後端 API）版本：啟用 VITE_API_URL 時載入並併入下拉。與本機版本分開保存，
  // 避免本機重新整理（loadAllVersions）覆寫掉雲端清單。
  const [remoteVersions, setRemoteVersions] = useState<DataVersionInfo[]>([]);

  // 下拉顯示的完整版本清單 = 本機（內建 + 發布）＋ 雲端（依 id 去重）。
  const allVersions = useMemo(() => {
    const ids = new Set(dataVersions.map((v) => v.id));
    return [...dataVersions, ...remoteVersions.filter((v) => !ids.has(v.id))];
  }, [dataVersions, remoteVersions]);

  // 啟用後端時，載入雲端版本併入下拉（best-effort，失敗則維持本機清單）。
  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    apiClient
      .listVersions()
      .then((remote) => {
        if (!cancelled) setRemoteVersions(remote.map(apiVersionToInfo));
      })
      .catch((err) => console.warn('載入雲端版本失敗', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeVersion = useMemo(
    () => allVersions.find((v) => v.id === activeVersionId),
    [allVersions, activeVersionId],
  );

  const selectDataVersion = useCallback(
    (id: string) => {
      const version = allVersions.find((v) => v.id === id);
      if (!version) return;
      const next = backfillAssignmentLevels(cloneOrgData(version.data));
      setActiveVersionId(id);
      setData(next);
      // 同步 draft 與 active 版本，確保重整後一致
      saveDraft(next);
      saveActiveVersionId(id);
    },
    [allVersions],
  );

  /** 發布草稿為一個新的本機版本（自動以時間戳命名，可指定生效日），並切換為當前版本。 */
  const publishVersion = useCallback((draft: OrgData, effectiveDate?: string) => {
    const { created } = addPublishedVersion(draft, undefined, effectiveDate);
    setDataVersions(loadAllVersions());
    setActiveVersionId(created.id);
    const next = backfillAssignmentLevels(cloneOrgData(created.data));
    setData(next);
    saveDraft(next);
    saveActiveVersionId(created.id);
    // 啟用後端時，寫穿到雲端並併入下拉（best-effort）。
    if (isApiEnabled()) {
      apiClient
        .publishVersion(created.label, created.data)
        .then((v) =>
          setRemoteVersions((prev) =>
            prev.some((p) => p.id === v.id) ? prev : [...prev, apiVersionToInfo(v)],
          ),
        )
        .catch((err) => console.warn('發布到雲端失敗', err));
    }
    return created.id;
  }, []);

  const deletePublishedVersionById = useCallback(
    (id: string) => {
      const isRemote = remoteVersions.some((v) => v.id === id);
      // 本機與雲端各自刪除；計算刪除後的可用清單以挑選 fallback。
      let localList = dataVersions;
      let remoteList = remoteVersions;
      if (isRemote) {
        remoteList = remoteVersions.filter((v) => v.id !== id);
        setRemoteVersions(remoteList);
        if (isApiEnabled()) {
          apiClient.deleteVersion(id).catch((err) => console.warn('刪除雲端版本失敗', err));
        }
      } else {
        deletePublishedVersionStorage(id);
        localList = loadAllVersions();
        setDataVersions(localList);
      }
      if (activeVersionId === id) {
        const lids = new Set(localList.map((v) => v.id));
        const all = [...localList, ...remoteList.filter((v) => !lids.has(v.id))];
        const fallbackId = pickDefaultVersionId(all);
        const fallback = all.find((v) => v.id === fallbackId);
        setActiveVersionId(fallbackId);
        saveActiveVersionId(fallbackId);
        if (fallback) {
          const next = backfillAssignmentLevels(cloneOrgData(fallback.data));
          setData(next);
          saveDraft(next);
        }
      }
    },
    [activeVersionId, dataVersions, remoteVersions],
  );

  const exportPublishedVersions = useCallback(() => {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .slice(0, 15);
    downloadJson(buildPublishedBundle(), `published-versions-${stamp}.json`);
  }, []);

  const importPublishedVersions = useCallback((raw: unknown): string | null => {
    try {
      mergePublishedBundle(raw);
      setDataVersions(loadAllVersions());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : '匯入失敗';
    }
  }, []);

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
      dataVersions: allVersions,
      activeVersionId,
      activeVersion,
      selectDataVersion,
      publishVersion,
      deletePublishedVersion: deletePublishedVersionById,
      exportPublishedVersions,
      importPublishedVersions,
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
      allVersions,
      activeVersionId,
      activeVersion,
      selectDataVersion,
      publishVersion,
      deletePublishedVersionById,
      exportPublishedVersions,
      importPublishedVersions,
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
