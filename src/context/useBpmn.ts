import { useContext } from 'react';
import { BpmnContext } from './bpmnContextState';

export function useBpmn() {
  const ctx = useContext(BpmnContext);
  if (!ctx) throw new Error('useBpmn must be used inside BpmnProvider');
  return ctx;
}
