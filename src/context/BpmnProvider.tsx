import { useCallback, useEffect, useReducer } from 'react';
import type { BpmnProcess, BpmnStore, ImpactBaseline, SimulationSession } from '../types/bpmn';
import type { OrgData } from '../types/org';
import { defaultExpenseProcess } from '../data/bpmn-defaults';
import { BPMN_SCHEMA_VERSION, migrateBpmnStore } from '../services/migrations/bpmnMigrations';
import { BpmnContext } from './bpmnContextState';

// ─── Storage ──────────────────────────────────────────────────────────────────

// 穩定的 key（與 schemaVersion 脫鉤）；保留讀取舊版 key 以平滑遷移。
const STORAGE_KEY = 'bpmn-store';
const LEGACY_KEYS = ['bpmn-store-v2', 'bpmn-store-v1'];

function defaultStore(): BpmnStore {
  return {
    schemaVersion: BPMN_SCHEMA_VERSION,
    processes: [defaultExpenseProcess],
    activeSession: null,
    simulationHistory: [],
    impactBaseline: null,
  };
}

function loadStore(): BpmnStore {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find((v) => v != null);
    if (raw) return migrateBpmnStore(JSON.parse(raw));
  } catch { /* ignore */ }
  return defaultStore();
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

// ─── Provider ────────────────────────────────────────────────────────────────

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
