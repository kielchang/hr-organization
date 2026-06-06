import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BpmnProvider, useBpmn } from './BpmnProvider';
import type { BpmnProcess } from '../types/bpmn';

const wrapper = ({ children }: { children: ReactNode }) => (
  <BpmnProvider>{children}</BpmnProvider>
);

function makeProcess(id: string): BpmnProcess {
  return {
    id, name: id, description: '', category: '', status: 'active', version: 1,
    nodes: [], edges: [], approvalThresholds: [], createdAt: '', updatedAt: '',
  };
}

describe('BpmnProvider', () => {
  it('初次載入帶入預設流程並寫入穩定 key', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    expect(result.current.store.schemaVersion).toBe(3);
    expect(result.current.store.processes.length).toBeGreaterThan(0);
    expect(localStorage.getItem('bpmn-store')).not.toBeNull();
  });

  it('upsertProcess 會持久化到 localStorage', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.upsertProcess(makeProcess('p-new')));
    expect(result.current.store.processes.some((p) => p.id === 'p-new')).toBe(true);
    const persisted = JSON.parse(localStorage.getItem('bpmn-store')!);
    expect(persisted.processes.some((p: BpmnProcess) => p.id === 'p-new')).toBe(true);
  });

  it('載入舊版 key（bpmn-store-v1）會自動 migration', () => {
    localStorage.setItem(
      'bpmn-store-v1',
      JSON.stringify({ processes: [{ id: 'legacy', name: '舊流程', nodes: [], edges: [] }] }),
    );
    const { result } = renderHook(() => useBpmn(), { wrapper });
    expect(result.current.store.schemaVersion).toBe(3);
    const legacy = result.current.store.processes.find((p) => p.id === 'legacy');
    expect(legacy?.status).toBe('active'); // migration 補上
    expect(legacy?.version).toBe(1);
  });

  it('useBpmn 在 Provider 外使用會丟錯', () => {
    expect(() => renderHook(() => useBpmn())).toThrow();
  });
});
