import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BpmnProvider } from './BpmnProvider';
import { useBpmn } from './useBpmn';
import type { BpmnProcess, SimulationSession } from '../types/bpmn';
import { makeOrgData } from '../test/fixtures';

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

  it('upsertProcess 對既有 id 為更新而非新增', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.upsertProcess(makeProcess('p1')));
    const countAfterAdd = result.current.store.processes.length;
    act(() => result.current.upsertProcess({ ...makeProcess('p1'), name: '改名' }));
    expect(result.current.store.processes.length).toBe(countAfterAdd);
    expect(result.current.store.processes.find((p) => p.id === 'p1')?.name).toBe('改名');
  });

  it('deleteProcess 移除流程', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.upsertProcess(makeProcess('p-del')));
    act(() => result.current.deleteProcess('p-del'));
    expect(result.current.store.processes.some((p) => p.id === 'p-del')).toBe(false);
  });

  const session = (id: string): SimulationSession => ({
    id, processId: 'p', processName: 'P',
    formData: { requesterId: 'e1', amount: 1, category: 'c', description: '', date: '' },
    resolvedPath: [], resolvedApprovers: {},
    orgContext: {} as SimulationSession['orgContext'],
    currentStep: 0, logs: [], status: 'running', startedAt: '',
  });

  it('setSession / updateSession 設定 activeSession，null 可清除', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.setSession(session('s1')));
    expect(result.current.store.activeSession?.id).toBe('s1');
    act(() => result.current.updateSession({ ...session('s1'), currentStep: 2 }));
    expect(result.current.store.activeSession?.currentStep).toBe(2);
    act(() => result.current.setSession(null));
    expect(result.current.store.activeSession).toBeNull();
  });

  it('addToHistory 加入歷程並對相同 id 去重', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.addToHistory(session('h1')));
    act(() => result.current.addToHistory(session('h1'))); // 重複
    act(() => result.current.addToHistory(session('h2')));
    const ids = result.current.store.simulationHistory.map((s) => s.id);
    expect(ids.filter((i) => i === 'h1')).toHaveLength(1);
    expect(ids).toContain('h2');
  });

  it('captureBaseline / clearBaseline 設定與清除影響分析基準', () => {
    const { result } = renderHook(() => useBpmn(), { wrapper });
    act(() => result.current.captureBaseline(makeOrgData(), '基準A'));
    expect(result.current.store.impactBaseline?.label).toBe('基準A');
    expect(result.current.store.impactBaseline?.data.employees).toEqual([]);
    act(() => result.current.clearBaseline());
    expect(result.current.store.impactBaseline).toBeNull();
  });

  it('useBpmn 在 Provider 外使用會丟錯', () => {
    expect(() => renderHook(() => useBpmn())).toThrow();
  });
});
