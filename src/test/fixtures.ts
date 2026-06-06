import { ORG_SCHEMA_VERSION } from '../services/migrations/orgMigrations';
import type {
  Assignment,
  Employee,
  Group,
  JobLevel,
  OrgData,
} from '../types/org';

/** 建立測試用 OrgData，未指定的欄位用合理預設。 */
export function makeOrgData(partial: Partial<OrgData> = {}): OrgData {
  return {
    schemaVersion: ORG_SCHEMA_VERSION,
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    employees: [],
    groups: [],
    jobLevels: [],
    assignments: [],
    changeLog: [],
    ...partial,
  };
}

export function emp(id: string, partial: Partial<Employee> = {}): Employee {
  return {
    id,
    employeeNo: id.toUpperCase(),
    name: id,
    status: 'active',
    ...partial,
  };
}

export function group(id: string, partial: Partial<Group> = {}): Group {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    parentId: null,
    status: 'active',
    ...partial,
  };
}

export function jobLevel(id: string, rank: number, partial: Partial<JobLevel> = {}): JobLevel {
  return { id, code: id.toUpperCase(), name: id, rank, ...partial };
}

export function assignment(id: string, partial: Partial<Assignment> = {}): Assignment {
  return {
    id,
    employeeId: 'e1',
    groupId: 'g1',
    jobLevelId: 'j1',
    supervisorIds: [],
    primarySupervisorId: null,
    isPrimaryGroup: true,
    ...partial,
  };
}
