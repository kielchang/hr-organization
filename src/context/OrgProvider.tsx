import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
import { ORG_SCHEMA_VERSION, migrateOrgData } from '../services/migrations/orgMigrations';
import { safeSetItem } from '../services/storage';
import {
  apiVersionToInfo,
  loadDataVersions,
  pickDefaultVersionId,
  pickLatestRemoteVersionId,
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
const CLOUD_SYNC_PENDING_KEY = 'hr-org-cloud-sync-pending';

/** 讀回「未同步到雲端」旗標；後端停用時恆視為 false。 */
function loadCloudSyncPending(): boolean {
  if (!isApiEnabled()) return false;
  try {
    return localStorage.getItem(CLOUD_SYNC_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

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

/**
 * 序列化 OrgData 以做「有無未發布變更」比較，排除易變欄位：
 * - `exportedAt`：每次 clone/匯出都會變動，比對意義不大。
 * - `changeLog`：含時間戳的稽核紀錄，易因非實質變更而誤判。
 * 兩邊都先 `cloneOrgData` 再剔除欄位，確保比較對稱且不更動原資料。
 */
function fingerprintOrgData(data: OrgData): string {
  const clone = cloneOrgData(data) as Partial<OrgData>;
  delete clone.exportedAt;
  delete clone.changeLog;
  return JSON.stringify(clone);
}

/** 草稿是否相對某版本資料「有未發布變更」（髒草稿）。 */
function isDirtyDraft(draft: OrgData, versionData: OrgData): boolean {
  return fingerprintOrgData(draft) !== fingerprintOrgData(versionData);
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
  /** 進 App 時是否有「屬於 active 版本且有未發布變更」的草稿。 */
  hadDirtyDraft: boolean;
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
  // 髒草稿＝屬於 active 版本且相對版本資料有未發布變更；只有沿用的草稿才納入判斷，
  // 不屬於 active 的草稿會被丟棄、視為無髒草稿，允許後續自動切到最新雲端版。
  const hadDirtyDraft = draftBelongsToActive && isDirtyDraft(draft, versionData);
  // 確立 active 版本，讓後續手動編輯存入的 draft 能在重整後被視為屬於此版本
  saveActiveVersionId(activeVersionId);
  return {
    dataVersions,
    activeVersionId,
    data: draftBelongsToActive ? draft : versionData,
    hadDirtyDraft,
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
  // 「本機已發布但未成功上雲」旗標：後端啟用時有意義，並持久化於 localStorage。
  const [pendingCloudSync, setPendingCloudSyncState] = useState<boolean>(
    loadCloudSyncPending,
  );

  // 設定 pending 並同步寫回 localStorage（best-effort，後端停用時恆為 false）。
  const setPendingCloudSync = useCallback((next: boolean) => {
    if (!isApiEnabled()) return;
    setPendingCloudSyncState(next);
    safeSetItem(CLOUD_SYNC_PENDING_KEY, next ? 'true' : 'false');
  }, []);
  // 雲端（後端 API）版本：啟用 VITE_API_URL 時載入並併入下拉。與本機版本分開保存，
  // 避免本機重新整理（loadAllVersions）覆寫掉雲端清單。
  const [remoteVersions, setRemoteVersions] = useState<DataVersionInfo[]>([]);
  // 自動「預設最新雲端版」相關旗標（契約：草稿優先，否則最新雲端版）。
  // hadDirtyDraft：進 App 時有未發布草稿 → 不自動切走。
  const hadDirtyDraftRef = useRef(initial.hadDirtyDraft);
  // autoDefaultLocked：自動切換最多執行一次，之後不再覆蓋任何選擇。
  const autoDefaultLockedRef = useRef(false);
  // userHasManuallySelected：使用者經 VersionSelector 手動選版後，禁止自動切換。
  const userHasManuallySelectedRef = useRef(false);

  // 下拉顯示的完整版本清單 = 本機（內建 + 發布）＋ 雲端（依 id 去重）。
  const allVersions = useMemo(() => {
    const ids = new Set(dataVersions.map((v) => v.id));
    return [...dataVersions, ...remoteVersions.filter((v) => !ids.has(v.id))];
  }, [dataVersions, remoteVersions]);

  // 自動「預設最新雲端版」決策（在雲端載入成功的非同步 callback 中呼叫一次）。
  // 條件：無髒草稿、使用者未手動選版、尚未自動切過、雲端有版本。
  // 直接用剛載入的 remoteInfos 取版本資料套用（此刻 allVersions 尚未含 remote），
  // 且不標記為「使用者手動」。此 callback 僅在掛載後的雲端載入回呼中執行一次，
  // 期間若使用者已手動選版會被上面的 guard 擋下，故以 initial.activeVersionId
  // （初始自動挑的本機預設 id）作為比較基準即可，無需鏡像 ref。
  const autoDefaultToLatestRemote = useCallback(
    (remoteInfos: DataVersionInfo[]) => {
      if (autoDefaultLockedRef.current) return;
      if (hadDirtyDraftRef.current) return;
      if (userHasManuallySelectedRef.current) return;
      const latestId = pickLatestRemoteVersionId(remoteInfos);
      if (!latestId) return;
      // 首次雲端載入後即鎖定，之後 remoteVersions 變動皆不再自動覆蓋。
      autoDefaultLockedRef.current = true;
      if (latestId === initial.activeVersionId) return;
      const latest = remoteInfos.find((v) => v.id === latestId);
      if (!latest) return;
      const next = cloneOrgData(latest.data);
      setActiveVersionId(latestId);
      setData(next);
      saveDraft(next);
      saveActiveVersionId(latestId);
    },
    [initial.activeVersionId],
  );

  // 啟用後端時，載入雲端版本併入下拉（best-effort，失敗則維持本機清單）。
  // 載入成功後執行「預設最新雲端版」：契約 §2 草稿優先，否則切到最新雲端版。
  // setState 都在非同步 callback 內，避免 effect body 同步 setState 造成連鎖渲染。
  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    apiClient
      .listVersions()
      .then((remote) => {
        if (cancelled) return;
        const remoteInfos = remote.map(apiVersionToInfo);
        setRemoteVersions(remoteInfos);
        autoDefaultToLatestRemote(remoteInfos);
      })
      .catch((err) => console.warn('載入雲端版本失敗', err));
    return () => {
      cancelled = true;
    };
  }, [autoDefaultToLatestRemote]);

  const activeVersion = useMemo(
    () => allVersions.find((v) => v.id === activeVersionId),
    [allVersions, activeVersionId],
  );

  // 切換 active 版本的核心邏輯（不區分來源）。自動「預設最新雲端版」與其他
  // 程式內部流程都走這裡，避免被誤標記為「使用者手動選版」。
  const applyVersionSelection = useCallback(
    (id: string) => {
      const version = allVersions.find((v) => v.id === id);
      if (!version) return;
      const next = cloneOrgData(version.data);
      setActiveVersionId(id);
      setData(next);
      // 同步 draft 與 active 版本，確保重整後一致
      saveDraft(next);
      saveActiveVersionId(id);
    },
    [allVersions],
  );

  // 對外（VersionSelector）使用者手動選版入口：標記手動以鎖住自動切換。
  const selectDataVersion = useCallback(
    (id: string) => {
      userHasManuallySelectedRef.current = true;
      applyVersionSelection(id);
    },
    [applyVersionSelection],
  );

  /**
   * 發布草稿為一個新的本機版本，並切換為當前版本。
   * opts：版本名稱（留空＝時間戳命名）、調整理由、生效日（皆選填）。
   */
  const publishVersion = useCallback(
    (
      draft: OrgData,
      opts?: { label?: string; note?: string; effectiveDate?: string },
    ) => {
      const { created } = addPublishedVersion(
        draft,
        opts?.label,
        opts?.effectiveDate,
        opts?.note,
      );
      setDataVersions(loadAllVersions());
      setActiveVersionId(created.id);
      const next = cloneOrgData(created.data);
      setData(next);
      saveDraft(next);
      saveActiveVersionId(created.id);
      // 啟用後端時，寫穿到雲端並併入下拉（best-effort）。note 不寫穿。
      if (isApiEnabled()) {
        // 發布當下若離線，雲端寫入註定失敗，先標記未同步（catch 也會再次標記，冪等）。
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setPendingCloudSync(true);
        }
        apiClient
          .publishVersion(created.label, created.data)
          .then((v) => {
            setRemoteVersions((prev) =>
              prev.some((p) => p.id === v.id) ? prev : [...prev, apiVersionToInfo(v)],
            );
            // 已成功上雲，清除未同步旗標。
            setPendingCloudSync(false);
          })
          .catch((err) => {
            console.warn('發布到雲端失敗', err);
            setPendingCloudSync(true);
          });
      }
      return created.id;
    },
    [setPendingCloudSync],
  );

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
          const next = cloneOrgData(fallback.data);
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
      // 使用者編輯資料即視為「已主動指定」，擋下背景雲端自動切換（避免在
      // 掛載→listVersions resolve 視窗內的編輯被靜默覆蓋）。
      userHasManuallySelectedRef.current = true;
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
      // 匯入檔案即視為「已主動指定」，擋下背景雲端自動切換（避免在
      // 掛載→listVersions resolve 視窗內匯入的資料被靜默覆蓋）。
      userHasManuallySelectedRef.current = true;
      const next = importOrgData(incoming, operator);
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
      pendingCloudSync,
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
      pendingCloudSync,
    ],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
