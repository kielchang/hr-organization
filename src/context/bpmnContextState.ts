import { createContext } from 'react';
import type { BpmnProcess, BpmnStore, SimulationSession } from '../types/bpmn';
import type { OrgData } from '../types/org';

export interface BpmnContextValue {
  store: BpmnStore;
  upsertProcess: (p: BpmnProcess) => void;
  deleteProcess: (id: string) => void;
  setSession: (s: SimulationSession | null) => void;
  updateSession: (s: SimulationSession) => void;
  addToHistory: (s: SimulationSession) => void;
  captureBaseline: (orgData: OrgData, label?: string) => void;
  clearBaseline: () => void;
}

export const BpmnContext = createContext<BpmnContextValue | null>(null);
