import { ORG_SCHEMA_VERSION, migrateOrgData } from './orgMigrations';

describe('migrateOrgData', () => {
  it('把無 schemaVersion 的舊資料升級到目前版本', () => {
    const legacy = {
      version: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      employees: [{ id: 'e1', employeeNo: 'E001', name: '甲', status: 'active' }],
      groups: [{ id: 'g1', code: 'G1', name: '組一', parentId: null, status: 'active' }],
      assignments: [
        {
          id: 'a1',
          employeeId: 'e1',
          groupId: 'g1',
          jobLevelId: 'j1',
          supervisorIds: [],
          primarySupervisorId: null,
          isPrimaryGroup: true,
        },
      ],
    };
    const out = migrateOrgData(legacy);
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.contentVersion).toBe(2); // 舊欄位 version 相容映射到 contentVersion
    expect(out.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('補齊缺漏的可選陣列（jobLevels / changeLog）', () => {
    const out = migrateOrgData({
      employees: [],
      groups: [],
      assignments: [],
    });
    expect(out.jobLevels).toEqual([]);
    expect(out.changeLog).toEqual([]);
    expect(out.contentVersion).toBe(1); // 預設內容版本
  });

  it('以組內匯報深度回填缺漏的 assignment.level', () => {
    const out = migrateOrgData({
      employees: [],
      groups: [],
      assignments: [
        {
          id: 'a-boss',
          employeeId: 'boss',
          groupId: 'g1',
          jobLevelId: 'j',
          supervisorIds: [],
          primarySupervisorId: null,
          isPrimaryGroup: true,
        },
        {
          id: 'a-staff',
          employeeId: 'staff',
          groupId: 'g1',
          jobLevelId: 'j',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          isPrimaryGroup: true,
        },
      ],
    });
    const boss = out.assignments.find((a) => a.id === 'a-boss');
    const staff = out.assignments.find((a) => a.id === 'a-staff');
    expect(boss?.level).toBe(1);
    expect(staff?.level).toBe(2);
  });

  it('已是最新版的資料維持不變（冪等）', () => {
    const current = {
      schemaVersion: ORG_SCHEMA_VERSION,
      contentVersion: 5,
      exportedAt: '2026-02-02T00:00:00.000Z',
      employees: [],
      groups: [],
      jobLevels: [],
      assignments: [],
      changeLog: [],
    };
    expect(migrateOrgData(current)).toMatchObject({
      schemaVersion: ORG_SCHEMA_VERSION,
      contentVersion: 5,
    });
  });
});
