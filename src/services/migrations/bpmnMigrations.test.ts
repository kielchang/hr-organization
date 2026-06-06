import { BPMN_SCHEMA_VERSION, migrateBpmnStore } from './bpmnMigrations';

describe('migrateBpmnStore', () => {
  it('舊格式（無 schemaVersion）→ 目前版本，補 status/version/simulationHistory/impactBaseline', () => {
    const legacy = {
      processes: [{ id: 'p1', name: '報銷', nodes: [], edges: [] }],
    };
    const out = migrateBpmnStore(legacy);
    expect(out.schemaVersion).toBe(BPMN_SCHEMA_VERSION);
    expect(out.processes[0].status).toBe('active');
    expect(out.processes[0].version).toBe(1);
    expect(out.simulationHistory).toEqual([]);
    expect(out.impactBaseline).toBeNull();
  });

  it('v2 → v3：補 impactBaseline，保留既有 processes', () => {
    const v2 = {
      schemaVersion: 2,
      processes: [{ id: 'p1', name: '報銷', status: 'draft', version: 4, nodes: [], edges: [] }],
      activeSession: null,
      simulationHistory: [],
    };
    const out = migrateBpmnStore(v2);
    expect(out.schemaVersion).toBe(3);
    expect(out.impactBaseline).toBeNull();
    expect(out.processes[0].version).toBe(4);
    expect(out.processes[0].status).toBe('draft');
  });

  it('已是 v3 維持不變', () => {
    const v3 = {
      schemaVersion: 3,
      processes: [],
      activeSession: null,
      simulationHistory: [],
      impactBaseline: null,
    };
    expect(migrateBpmnStore(v3)).toMatchObject({ schemaVersion: 3 });
  });

  it('損壞輸入（無 processes）回退為空陣列而不丟例外', () => {
    const out = migrateBpmnStore({});
    expect(out.schemaVersion).toBe(BPMN_SCHEMA_VERSION);
    expect(out.processes).toEqual([]);
  });
});
