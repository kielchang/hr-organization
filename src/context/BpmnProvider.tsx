import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import type { BpmnProcess, BpmnStore, ImpactBaseline, SimulationSession } from '../types/bpmn';
import type { OrgData } from '../types/org';
import { defaultExpenseProcess } from '../data/bpmn-defaults';

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bpmn-store-v2';

/** v1→v2 migration：補 schemaVersion / simulationHistory / process.status / version */
function migrateV1(raw: Record<string, unknown>): BpmnStore {
  const processes = ((raw.processes as BpmnProcess[] | undefined) ?? []).map((p) => ({
    ...p,
    status: p.status ?? ('active' as const),
    version: p.version ?? 1,
  }));
  return {
    schemaVersion: 3,
    processes,
    activeSession: null,
    simulationHistory: [],
    impactBaseline: null,
  };
}

/** v2→v3 migration：補 impactBaseline */
function migrateV2(raw: BpmnStore): BpmnStore {
  return { ...raw, schemaVersion: 3, impactBaseline: null };
}

function loadStore(): BpmnStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BpmnStore;
      if (parsed.schemaVersion === 3) return parsed;
      if (parsed.schemaVersion === 2) return migrateV2(parsed);
    }
    // Attempt to read old v1 format
    const oldRaw = localStorage.getItem('bpmn-store-v1');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as Record<string, unknown>;
      return migrateV1(oldParsed);
    }
  } catch { /* ignore */ }
  return {
    schemaVersion: 3,
    processes: [defaultExpenseProcess],
    activeSession: null,
    simulationHistory: [],
    impactBaseline: null,
  };
}

function saveStore(store: BpmnStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'UPSERT_PROCESS'; process: BpmnProcess }
  | { type: 'DELETE_PROCESS'; id: string }
  | { type: 'SET_SESSION'; session: SimulationSession | null }
  | { type: 'UPDATE_SESSION'; session: SimulationSession }
  | { type: 'ADD_TO_HISTORY'; session: SimulationSession }
  | { type: 'CAPTURE_BASELINE'; baseline: ImpactBaseline }
  | { type: 'CLEAR_BASELINE' };

function reducer(state: BpmnStore, action: Action): BpmnStore {
  switch (action.type) {
    case 'UPSERT_PROCESS': {
      const exists = state.processes.some((p) => p.id === action.process.id);
      const processes = exists
        ? state.processes.map((p) => (p.id === action.process.id ? action.process : p))
        : [...state.processes, action.process];
      return { ...state, processes };
    }
    case 'DELETE_PROCESS':
      return { ...state, processes: state.processes.filter((p) => p.id !== action.id) };
    case 'SET_SESSION':
      return { ...state, activeSession: action.session };
    case 'UPDATE_SESSION':
      return { ...state, activeSession: action.session };
    case 'ADD_TO_HISTORY': {
      const already = state.simulationHistory.some((s) => s.id === action.session.id);
      if (already) return state;
      return {
        ...state,
        simulationHistory: [action.session, ...state.simulationHistory].slice(0, 100),
      };
    }
    case 'CAPTURE_BASELINE':
      return { ...state, impactBaseline: action.baseline };
    case 'CLEAR_BASELINE':
      return { ...state, impactBaseline: null };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface BpmnContextValue {
  store: BpmnStore;
  upsertProcess: (p: BpmnProcess) => void;
  deleteProcess: (id: string) => void;
  setSession: (s: SimulationSession | null) => void;
  updateSession: (s: SimulationSession) => void;
  addToHistory: (s: SimulationSession) => void;
  captureBaseline: (orgData: OrgData, label?: string) => void;
  clearBaseline: () => void;
}

const BpmnContext = createContext<BpmnContextValue | null>(null);

export function BpmnProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, undefined, loadStore);

  useEffect(() => { saveStore(store); }, [store]);

  const upsertProcess = useCallback(
    (p: BpmnProcess) => dispatch({ type: 'UPSERT_PROCESS', process: p }),
    [],
  );
  const deleteProcess = useCallback(
    (id: string) => dispatch({ type: 'DELETE_PROCESS', id }),
    [],
  );
  const setSession = useCallback(
    (s: SimulationSession | null) => dispatch({ type: 'SET_SESSION', session: s }),
    [],
  );
  const updateSession = useCallback(
    (s: SimulationSession) => dispatch({ type: 'UPDATE_SESSION', session: s }),
    [],
  );
  const addToHistory = useCallback(
    (s: SimulationSession) => dispatch({ type: 'ADD_TO_HISTORY', session: s }),
    [],
  );
  const captureBaseline = useCallback(
    (orgData: OrgData, label?: string) =>
      dispatch({
        type: 'CAPTURE_BASELINE',
        baseline: {
          capturedAt: new Date().toISOString(),
          label: label ?? `快照 ${new Date().toLocaleString('zh-TW')}`,
          data: orgData,
        },
      }),
    [],
  );
  const clearBaseline = useCallback(
    () => dispatch({ type: 'CLEAR_BASELINE' }),
    [],
  );

  return (
    <BpmnContext.Provider
      value={{
        store,
        upsertProcess,
        deleteProcess,
        setSession,
        updateSession,
        addToHistory,
        captureBaseline,
        clearBaseline,
      }}
    >
      {children}
    </BpmnContext.Provider>
  );
}

export function useBpmn() {
  const ctx = useContext(BpmnContext);
  if (!ctx) throw new Error('useBpmn must be used inside BpmnProvider');
  return ctx;
}
