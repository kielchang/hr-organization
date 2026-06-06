import type { BpmnProcess, BpmnStore } from '../../types/bpmn';
import { runMigrations, type Migration } from './runMigrations';

/** BpmnStore 目前的 schema 版本。 */
export const BPMN_SCHEMA_VERSION = 3;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/**
 * v0/v1（舊格式，無 schemaVersion）→ v2：
 * 補 process.status / process.version，並補 simulationHistory。
 */
const toV2: Migration = {
  to: 2,
  migrate: (raw) => {
    const r = asRecord(raw);
    const processes = (Array.isArray(r.processes) ? r.processes : []).map((p) => {
      const proc = p as Partial<BpmnProcess>;
      return {
        ...proc,
        status: proc.status ?? ('active' as const),
        version: proc.version ?? 1,
      };
    });
    return {
      schemaVersion: 2,
      processes,
      activeSession: r.activeSession ?? null,
      simulationHistory: Array.isArray(r.simulationHistory)
        ? r.simulationHistory
        : [],
    };
  },
};

/** v2 → v3：加入影響分析基準欄位。 */
const toV3: Migration = {
  to: 3,
  migrate: (raw) => {
    const r = asRecord(raw);
    return { ...r, schemaVersion: 3, impactBaseline: r.impactBaseline ?? null };
  },
};

export const bpmnMigrations: Migration[] = [toV2, toV3];

/** 將任意版本的 BPMN store 升級到目前 schema 版本。 */
export function migrateBpmnStore(raw: unknown): BpmnStore {
  return runMigrations<BpmnStore>(raw, BPMN_SCHEMA_VERSION, bpmnMigrations);
}
