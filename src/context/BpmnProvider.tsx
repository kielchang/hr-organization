import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import type { BpmnProcess, BpmnStore, SimulationSession } from '../types/bpmn';
import { defaultExpenseProcess } from '../data/bpmn-defaults';

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bpmn-store-v2';

/** v1→v2 migration：補上 schemaVersion, simulationHistory, process.status/version */
function migrateV1(raw: Record<string, unknown>): BpmnStore {
  const processes = ((raw.processes as BpmnProcess[] | undefined) ?? []).map((p) => ({
    status: 'active' as const,
    version: 1,
    ...p,
    // 各節點若無 approverResolution，保持 undefined（fallback 在 resolver 中處理）
  }));
  return {
    schemaVersion: 2,
    processes,
    activeSession: null,
    simulationHistory: [],
  };
}

function loadStore(): BpmnStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BpmnStore;
      if (parsed.schemaVersion === 2) return parsed;
    }
    // 嘗試讀舊格式
    const oldRaw = localStorage.getItem('bpmn-store-v1');
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw) as Record<string, unknown>;
      return migrateV1(oldParsed);
    }
  } catch { /* ignore */ }
  return {
    schemaVersion: 2,
    processes: [defaultExpenseProcess],
    activeSession: null,
    simulationHistory: [],
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
  | { type: 'ADD_TO_HISTORY'; session: SimulationSession };

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
      // 避免重複加入同一 session
      const already = state.simulationHistory.some((s) => s.id === action.session.id);
      if (already) return state;
      return {
        ...state,
        simulationHistory: [action.session, ...state.simulationHistory].slice(0, 100),
      };
    }
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

  return (
    <BpmnContext.Provider
      value={{ store, upsertProcess, deleteProcess, setSession, updateSession, addToHistory }}
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
