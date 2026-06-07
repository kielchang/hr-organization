import {
  ORG_SCHEMA_VERSION,
  backfillGroupLeaders,
  migrateOrgData,
} from './orgMigrations';
import { assignment, group, makeOrgData } from '../../test/fixtures';

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

  it('v2 起跑全鏈：v3 清除所有 assignment.level（層級改由主匯報深度計算）', () => {
    // 帶有顯式 level 的 v2 資料（level 為佈局產物／職等殘值，非使用者覆寫）。
    const out = migrateOrgData({
      schemaVersion: 2,
      contentVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      employees: [],
      groups: [],
      jobLevels: [],
      changeLog: [],
      assignments: [
        {
          id: 'a-boss',
          employeeId: 'boss',
          groupId: 'g1',
          jobLevelId: 'j',
          supervisorIds: [],
          primarySupervisorId: null,
          isPrimaryGroup: true,
          level: 1,
        },
        {
          id: 'a-staff',
          employeeId: 'staff',
          groupId: 'g1',
          jobLevelId: 'j',
          supervisorIds: ['boss'],
          primarySupervisorId: 'boss',
          isPrimaryGroup: true,
          level: 2,
        },
      ],
    });
    // migrateOrgData 一路升到最新版（含 v3 清 level、v4 回填 leaderId）。
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    // 所有 assignment.level 一律清為 undefined（v3 之後改走計算深度，v4 不再動 level）。
    expect(out.assignments.every((a) => a.level === undefined)).toBe(true);
  });

  it('無 schemaVersion 的舊匯出檔：經 v1 backfill 後仍被 v3 清掉 level（淨結果 undefined）', () => {
    // 缺 schemaVersion → 走完整 v0→v1→v2→v3 路徑；
    // v1 的 backfill 會回填 level，但 v3 再清掉 → 最終所有 level 為 undefined。
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
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.assignments.every((a) => a.level === undefined)).toBe(true);
  });

  it('v1→v2：缺 kind 的舊 group 回填為 department', () => {
    const out = migrateOrgData({
      schemaVersion: 1,
      contentVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      employees: [],
      groups: [
        { id: 'g1', code: 'G1', name: '組一', parentId: null, status: 'active' },
        { id: 'g2', code: 'G2', name: '組二', parentId: 'g1', status: 'active' },
      ],
      jobLevels: [],
      assignments: [],
      changeLog: [],
    });
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.groups.map((g) => g.kind)).toEqual(['department', 'department']);
  });

  it('v1→v2：已標記 kind 的 group 不被覆寫', () => {
    const out = migrateOrgData({
      schemaVersion: 1,
      contentVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      employees: [],
      groups: [
        { id: 'g1', code: 'G1', name: '部門', parentId: null, status: 'active', kind: 'department' },
        { id: 'g2', code: 'XFN', name: '職能', parentId: null, status: 'active', kind: 'function' },
      ],
      jobLevels: [],
      assignments: [],
      changeLog: [],
    });
    const byId = new Map(out.groups.map((g) => [g.id, g.kind]));
    expect(byId.get('g1')).toBe('department');
    expect(byId.get('g2')).toBe('function');
  });

  it('無 schemaVersion 的舊匯出檔一路升級到 v2 並補 kind', () => {
    const out = migrateOrgData({
      employees: [],
      groups: [{ id: 'g1', code: 'G1', name: '組一', parentId: null, status: 'active' }],
      assignments: [],
    });
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.groups[0].kind).toBe('department');
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

  // ── v3 → v4：為 group 回填 leaderId（組長＝組內匯報根） ────────────────────
  describe('v3→v4：回填 group.leaderId', () => {
    /** 一份 v3 資料：g1 有匯報樹（boss←a←b）、g2 為空組、g3 已預設 leaderId。 */
    function v3Data() {
      return {
        schemaVersion: 3,
        contentVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        employees: [
          { id: 'boss', employeeNo: 'E1', name: '甲', status: 'active' },
          { id: 'a', employeeNo: 'E2', name: '乙', status: 'active' },
          { id: 'b', employeeNo: 'E3', name: '丙', status: 'active' },
          { id: 'preset', employeeNo: 'E4', name: '丁', status: 'active' },
        ],
        groups: [
          { id: 'g1', code: 'G1', name: '組一', parentId: null, status: 'active', kind: 'department' },
          { id: 'g2', code: 'G2', name: '空組', parentId: null, status: 'active', kind: 'department' },
          { id: 'g3', code: 'G3', name: '已指定組長', parentId: null, status: 'active', kind: 'department', leaderId: 'preset' },
        ],
        jobLevels: [],
        changeLog: [],
        assignments: [
          { id: 'a-boss', employeeId: 'boss', groupId: 'g1', jobLevelId: 'j', supervisorIds: [], primarySupervisorId: null, isPrimaryGroup: true },
          { id: 'a-a', employeeId: 'a', groupId: 'g1', jobLevelId: 'j', supervisorIds: ['boss'], primarySupervisorId: 'boss', isPrimaryGroup: true },
          { id: 'a-b', employeeId: 'b', groupId: 'g1', jobLevelId: 'j', supervisorIds: ['a'], primarySupervisorId: 'a', isPrimaryGroup: true },
          { id: 'a-preset', employeeId: 'preset', groupId: 'g3', jobLevelId: 'j', supervisorIds: [], primarySupervisorId: null, isPrimaryGroup: true },
        ],
      };
    }

    it('各組 leaderId 被回填：有匯報樹的組 = 組內匯報根、空組 = null', () => {
      const out = migrateOrgData(v3Data());
      expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
      const byId = new Map(out.groups.map((g) => [g.id, g.leaderId]));
      expect(byId.get('g1')).toBe('boss'); // 組內匯報根
      expect(byId.get('g2')).toBeNull(); // 空組 → null
    });

    it('已有 leaderId 的組不被覆寫', () => {
      const out = migrateOrgData(v3Data());
      const byId = new Map(out.groups.map((g) => [g.id, g.leaderId]));
      expect(byId.get('g3')).toBe('preset');
    });

    it('deterministic：同輸入多次 migrate 結果一致', () => {
      const a = migrateOrgData(v3Data());
      const b = migrateOrgData(v3Data());
      expect(a.groups.map((g) => g.leaderId)).toEqual(
        b.groups.map((g) => g.leaderId),
      );
    });

    it('不損其他欄位（employees / assignments / 其他 group 欄位完整）', () => {
      const input = v3Data();
      const out = migrateOrgData(input);
      // employees 數量／內容不變。
      expect(out.employees).toEqual(input.employees);
      // assignments 數量不變（level 經 v3 已清為 undefined，但筆數與識別不變）。
      expect(out.assignments.map((a) => a.id).sort()).toEqual(
        input.assignments.map((a) => a.id).sort(),
      );
      // group 其他欄位（code/name/parentId/status/kind）原樣保留。
      const g1 = out.groups.find((g) => g.id === 'g1')!;
      expect(g1).toMatchObject({
        code: 'G1',
        name: '組一',
        parentId: null,
        status: 'active',
        kind: 'department',
      });
    });

    it('v0（無 schemaVersion）→ v4 全鏈跑通並回填 leaderId', () => {
      // 缺 schemaVersion → 走完整 v0→v1→v2→v3→v4：kind 補 department、level 清空、leaderId 回填。
      const out = migrateOrgData({
        employees: [
          { id: 'boss', employeeNo: 'E1', name: '甲', status: 'active' },
          { id: 'a', employeeNo: 'E2', name: '乙', status: 'active' },
        ],
        groups: [{ id: 'g1', code: 'G1', name: '組一', parentId: null, status: 'active' }],
        assignments: [
          { id: 'a-boss', employeeId: 'boss', groupId: 'g1', jobLevelId: 'j', supervisorIds: [], primarySupervisorId: null, isPrimaryGroup: true },
          { id: 'a-a', employeeId: 'a', groupId: 'g1', jobLevelId: 'j', supervisorIds: ['boss'], primarySupervisorId: 'boss', isPrimaryGroup: true },
        ],
      });
      expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
      expect(out.groups[0].kind).toBe('department'); // v2 回填
      expect(out.assignments.every((a) => a.level === undefined)).toBe(true); // v3 清空
      expect(out.groups[0].leaderId).toBe('boss'); // v4 回填組內匯報根
    });
  });

  // ── backfillGroupLeaders（純函式，供 v4 與 QA 共用）────────────────────────
  describe('backfillGroupLeaders', () => {
    it('leaderId 未設者回填組內匯報根、空組為 null、已設者不動', () => {
      const data = makeOrgData({
        groups: [
          group('g1'),
          group('g2'), // 空組
          group('g3', { leaderId: 'fixed' }), // 已指定
        ],
        assignments: [
          assignment('a-boss', { employeeId: 'boss', groupId: 'g1' }),
          assignment('a-a', {
            employeeId: 'a',
            groupId: 'g1',
            supervisorIds: ['boss'],
            primarySupervisorId: 'boss',
          }),
        ],
      });
      const groups = backfillGroupLeaders(data);
      const byId = new Map(groups.map((g) => [g.id, g.leaderId]));
      expect(byId.get('g1')).toBe('boss');
      expect(byId.get('g2')).toBeNull();
      expect(byId.get('g3')).toBe('fixed'); // 已有值不被覆寫
    });

    it('leaderId === null 視為未設 → 重新回填', () => {
      // 顯式 null（非「已指定」）→ 應被當作未設並回填。
      const data = makeOrgData({
        groups: [group('g1', { leaderId: null })],
        assignments: [assignment('a-boss', { employeeId: 'boss', groupId: 'g1' })],
      });
      expect(backfillGroupLeaders(data)[0].leaderId).toBe('boss');
    });

    it('不可變：回傳新陣列，不就地修改輸入 groups', () => {
      const original = group('g1'); // 無 leaderId 欄位
      const data = makeOrgData({
        groups: [original],
        assignments: [assignment('a-boss', { employeeId: 'boss', groupId: 'g1' })],
      });
      const out = backfillGroupLeaders(data);
      expect(out[0]).not.toBe(original); // 新物件
      expect(original).not.toHaveProperty('leaderId'); // 原物件未被汙染
      expect(out[0].leaderId).toBe('boss');
    });
  });
});
