import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import type { BpmnProcess, BpmnStore, SimulationSession } from '../types/bpmn';
import { defaultExpenseProcess } from '../data/bpmn-defaults';

// ─── State ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bpmn-store-v1';

function loadStore(): BpmnStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BpmnStore;
  } catch { /* ignore */ }
  return { processes: [defaultExpenseProcess], activeSession: null };
}

function saveStore(store: BpmnStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'UPSERT_PROCESS'; process: BpmnProcess }
  | { type: 'DELETE_PROCESS'; id: string }
  | { type: 'SET_SESSION'; session: SimulationSession | null }
  | { type: 'UPDATE_SESSION'; session: SimulationSession };

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
}

const BpmnContext = createContext<BpmnContextValue | null>(null);

export function BpmnProvider({ children }: { children: React.ReactNode }) {
  const [store, dispatch] = useReducer(reducer, undefined, loadStore);

  useEffect(() => { saveStore(store); }, [store]);

  const upsertProcess = useCallback((p: BpmnProcess) => dispatch({ type: 'UPSERT_PROCESS', process: p }), []);
  const deleteProcess = useCallback((id: string) => dispatch({ type: 'DELETE_PROCESS', id }), []);
  const setSession = useCallback((s: SimulationSession | null) => dispatch({ type: 'SET_SESSION', session: s }), []);
  const updateSession = useCallback((s: SimulationSession) => dispatch({ type: 'UPDATE_SESSION', session: s }), []);

  return (
    <BpmnContext.Provider value={{ store, upsertProcess, deleteProcess, setSession, updateSession }}>
      {children}
    </BpmnContext.Provider>
  );
}

export function useBpmn() {
  const ctx = useContext(BpmnContext);
  if (!ctx) throw new Error('useBpmn must be used inside BpmnProvider');
  return ctx;
}
