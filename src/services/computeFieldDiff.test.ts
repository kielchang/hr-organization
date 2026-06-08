import {
  computeFieldDiff,
  diffChangeEntryFields,
  sessionChangeEntries,
  type FieldChange,
} from './computeFieldDiff';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';
import type { Assignment, ChangeEntry, OrgData } from '../types/org';

/**
 * computeFieldDiff／sessionChangeEntries／diffChangeEntryFields 純函式測試。
 *
 * 鎖住：assignment 欄位級對比、未變欄位不產 change、added/removed、
 * employee/group 欄位對比、名稱聯集解析、deterministic 排序，
 * 以及 session changeLog 抽取與 changeEntry 欄位展開。
 */

/** 從一組 entries 找出指定欄位 key 的 FieldChange（找不到回 undefined）。 */
function fieldByKey(fields: FieldChange[], key: string): FieldChange | undefined {
  return fields.find((f) => f.key === key);
}

describe('computeFieldDiff — assignment 欄位級對比', () => {
  /** base/draft 共用底圖：兩員工 A/B、組別 g1/g2、職級 j1/j2，一筆歸屬 a1。 */
  function makeBase(assignOverride: Partial<Assignment> = {}): OrgData {
    return makeOrgData({
      employees: [emp('A', { name: '主管甲' }), emp('B', { name: '主管乙' })],
      groups: [
        group('g1', { name: '研發部' }),
        group('g2', { name: '行銷部' }),
      ],
      jobLevels: [jobLevel('j1', 10, { name: '初階' }), jobLevel('j2', 20, { name: '資深' })],
      assignments: [
        assignment('a1', {
          employeeId: 'A',
          groupId: 'g1',
          jobLevelId: 'j1',
          supervisorIds: ['A'],
          primarySupervisorId: 'A',
          isPrimaryGroup: true,
          level: 3,
          ...assignOverride,
        }),
      ],
    });
  }

  /** 以 base 為底，覆寫 a1 的部分欄位產出 draft。 */
  function draftWith(base: OrgData, patch: Partial<Assignment>): OrgData {
    return {
      ...base,
      assignments: base.assignments.map((a) =>
        a.id === 'a1' ? { ...a, ...patch } : a,
      ),
    };
  }

  it('primarySupervisorId A→B：產一筆主管 change，前後為姓名', () => {
    const base = makeBase();
    const draft = draftWith(base, {
      primarySupervisorId: 'B',
      supervisorIds: ['B'],
    });

    const result = computeFieldDiff(base, draft);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.type).toBe('assignment');
    expect(entry.kind).toBe('modified');

    const supChange = fieldByKey(entry.fields, 'primarySupervisorId')!;
    expect(supChange.label).toBe('主管');
    expect(supChange.before).toBe('主管甲');
    expect(supChange.after).toBe('主管乙');
  });

  it('groupId g1→g2：產「組別」change，前後為組名', () => {
    const base = makeBase();
    const draft = draftWith(base, { groupId: 'g2' });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'groupId',
    )!;
    expect(change.label).toBe('組別');
    expect(change.before).toBe('研發部');
    expect(change.after).toBe('行銷部');
  });

  it('level 3→undefined：after 顯示「自動」', () => {
    const base = makeBase();
    const draft = draftWith(base, { level: undefined });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'level',
    )!;
    expect(change.before).toBe('3');
    expect(change.after).toBe('自動');
  });

  it('level undefined→3：before「自動」、after「3」', () => {
    const base = makeBase({ level: undefined });
    const draft = draftWith(base, { level: 3 });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'level',
    )!;
    expect(change.before).toBe('自動');
    expect(change.after).toBe('3');
  });

  it('isPrimaryGroup true→false：「是」→「否」', () => {
    const base = makeBase({ isPrimaryGroup: true });
    const draft = draftWith(base, { isPrimaryGroup: false });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'isPrimaryGroup',
    )!;
    expect(change.label).toBe('主歸屬');
    expect(change.before).toBe('是');
    expect(change.after).toBe('否');
  });

  it('主管 A→null：after 顯示「（無）」', () => {
    const base = makeBase();
    const draft = draftWith(base, {
      primarySupervisorId: null,
      supervisorIds: [],
    });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'primarySupervisorId',
    )!;
    expect(change.before).toBe('主管甲');
    expect(change.after).toBe('（無）');
  });

  it('jobLevelId j1→j2：產「職級」change，前後為職級名', () => {
    const base = makeBase();
    const draft = draftWith(base, { jobLevelId: 'j2' });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'jobLevelId',
    )!;
    expect(change.label).toBe('職級');
    expect(change.before).toBe('初階');
    expect(change.after).toBe('資深');
  });

  it('未變欄位不產 FieldChange：僅改 groupId，主管/層級等不入列', () => {
    const base = makeBase();
    const draft = draftWith(base, { groupId: 'g2' });

    const fields = computeFieldDiff(base, draft).entries[0].fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('groupId');
  });

  it('supervisorIds 集合相同（順序不同）不算 dotted 變更', () => {
    // primary=A，dotted＝[B]。before/after dotted 集合相同 → 其他主管欄不產 change。
    const base = makeBase({
      supervisorIds: ['A', 'B'],
      primarySupervisorId: 'A',
    });
    // 改 groupId 觸發 modified，但 dotted 主管字串前後相同（皆「主管乙」）→ 不產 supervisorIds change。
    const draft = draftWith(base, { groupId: 'g2' });

    const fields = computeFieldDiff(base, draft).entries[0].fields;
    expect(fieldByKey(fields, 'supervisorIds')).toBeUndefined();
    // 只剩 groupId 一筆。
    expect(fields).toHaveLength(1);
  });
});

describe('computeFieldDiff — added / removed 實體', () => {
  it('新增 employee：kind=added、fields=[]、title 為姓名', () => {
    const base = makeOrgData({ employees: [emp('e1', { name: '原有' })] });
    const draft = makeOrgData({
      employees: [emp('e1', { name: '原有' }), emp('e2', { name: '新人' })],
    });

    const result = computeFieldDiff(base, draft);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.type).toBe('employee');
    expect(entry.kind).toBe('added');
    expect(entry.id).toBe('e2');
    expect(entry.title).toBe('新人');
    expect(entry.fields).toEqual([]);
  });

  it('移除 employee：kind=removed、fields=[]、title 用 base 名稱解析', () => {
    const base = makeOrgData({
      employees: [emp('e1', { name: '留下' }), emp('e2', { name: '離開' })],
    });
    const draft = makeOrgData({ employees: [emp('e1', { name: '留下' })] });

    const result = computeFieldDiff(base, draft);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.kind).toBe('removed');
    expect(entry.id).toBe('e2');
    expect(entry.title).toBe('離開');
    expect(entry.fields).toEqual([]);
  });
});

describe('computeFieldDiff — employee / group 欄位對比', () => {
  it('group leaderId 改：產「組長」change，前後為員工名', () => {
    const base = makeOrgData({
      employees: [emp('lx', { name: '組長舊' }), emp('ly', { name: '組長新' })],
      groups: [group('g1', { name: '研發部', leaderId: 'lx' })],
    });
    const draft = makeOrgData({
      employees: [emp('lx', { name: '組長舊' }), emp('ly', { name: '組長新' })],
      groups: [group('g1', { name: '研發部', leaderId: 'ly' })],
    });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'leaderId',
    )!;
    expect(change.label).toBe('組長');
    expect(change.before).toBe('組長舊');
    expect(change.after).toBe('組長新');
  });

  it('group parentId null→g0：產「上級組」change，before「（無）」after 組名', () => {
    const base = makeOrgData({
      groups: [
        group('g0', { name: '總部' }),
        group('g1', { name: '研發部', parentId: null }),
      ],
    });
    const draft = makeOrgData({
      groups: [
        group('g0', { name: '總部' }),
        group('g1', { name: '研發部', parentId: 'g0' }),
      ],
    });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'parentId',
    )!;
    expect(change.label).toBe('上級組');
    expect(change.before).toBe('（無）');
    expect(change.after).toBe('總部');
  });

  it('employee name 改：產「姓名」change', () => {
    const base = makeOrgData({ employees: [emp('e1', { name: '小明' })] });
    const draft = makeOrgData({ employees: [emp('e1', { name: '大明' })] });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'name',
    )!;
    expect(change.before).toBe('小明');
    expect(change.after).toBe('大明');
  });

  it('employee status active→inactive：產「狀態」change（在職→停用）', () => {
    const base = makeOrgData({ employees: [emp('e1', { status: 'active' })] });
    const draft = makeOrgData({
      employees: [emp('e1', { status: 'inactive' })],
    });

    const change = fieldByKey(
      computeFieldDiff(base, draft).entries[0].fields,
      'status',
    )!;
    expect(change.before).toBe('在職');
    expect(change.after).toBe('停用');
  });
});

describe('computeFieldDiff — 名稱聯集解析（base ∪ draft）', () => {
  it('被移除員工仍能被引用解析：assignment 主管指向已移除的員工，名稱用 base 回退', () => {
    // base 有員工 gone（被某 assignment 設為主管），draft 移除了 gone，
    // 但 assignment 的主管在 draft 改為別人 → 主管 change 的 before 應仍解析得出 gone 名稱。
    const base = makeOrgData({
      employees: [emp('gone', { name: '已離職主管' }), emp('keep', { name: '留任' }), emp('staff')],
      groups: [group('g1', { name: '部門' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', {
          employeeId: 'staff',
          groupId: 'g1',
          jobLevelId: 'j1',
          supervisorIds: ['gone'],
          primarySupervisorId: 'gone',
        }),
      ],
    });
    const draft: OrgData = {
      ...base,
      // draft 移除 gone（離職）。
      employees: [emp('keep', { name: '留任' }), emp('staff')],
      assignments: base.assignments.map((a) => ({
        ...a,
        supervisorIds: ['keep'],
        primarySupervisorId: 'keep',
      })),
    };

    const result = computeFieldDiff(base, draft);
    const assignmentEntry = result.entries.find((e) => e.type === 'assignment')!;
    const supChange = fieldByKey(assignmentEntry.fields, 'primarySupervisorId')!;
    // 即使 gone 已從 draft 移除，before 仍用 base 解析出其姓名。
    expect(supChange.before).toBe('已離職主管');
    expect(supChange.after).toBe('留任');
  });
});

describe('computeFieldDiff — deterministic 排序與計數', () => {
  it('混合多型別/多 kind：排序為 type(assign→emp→group) → kind(mod→add→rem) → id', () => {
    // 設計多筆變更，覆蓋三種 type 與三種 kind，並在同 type/同 kind 內放多 id 驗證字典序。
    const base = makeOrgData({
      employees: [
        emp('emR', { name: '員工待移除' }),
        emp('emM', { name: '員工原名' }),
      ],
      groups: [
        group('grR', { name: '組待移除' }),
        group('grM', { name: '組原名' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('asM2', { employeeId: 'emM', groupId: 'grM', jobLevelId: 'j1', isPrimaryGroup: false, level: 1 }),
        assignment('asM1', { employeeId: 'emM', groupId: 'grM', jobLevelId: 'j1', isPrimaryGroup: false, level: 1 }),
        assignment('asR', { employeeId: 'emM', groupId: 'grR', jobLevelId: 'j1', isPrimaryGroup: false }),
      ],
    });
    const draft = makeOrgData({
      employees: [
        // emR 移除；emM 改名（modified）；emA 新增。
        emp('emM', { name: '員工新名' }),
        emp('emA', { name: '員工新增' }),
      ],
      groups: [
        // grR 移除；grM 改名（modified）；grA 新增。
        group('grM', { name: '組新名' }),
        group('grA', { name: '組新增' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // asM1/asM2 改 level（modified）；asR 移除；asA 新增。
        assignment('asM2', { employeeId: 'emM', groupId: 'grM', jobLevelId: 'j1', isPrimaryGroup: false, level: 2 }),
        assignment('asM1', { employeeId: 'emM', groupId: 'grM', jobLevelId: 'j1', isPrimaryGroup: false, level: 2 }),
        assignment('asA', { employeeId: 'emA', groupId: 'grA', jobLevelId: 'j1', isPrimaryGroup: false }),
      ],
    });

    const result = computeFieldDiff(base, draft);

    // 預期順序（type 群組 assignment→employee→group；群組內 modified→added→removed；同 kind id 字典序）：
    const order = result.entries.map((e) => `${e.type}:${e.kind}:${e.id}`);
    expect(order).toEqual([
      // assignment 群組
      'assignment:modified:asM1',
      'assignment:modified:asM2',
      'assignment:added:asA',
      'assignment:removed:asR',
      // employee 群組
      'employee:modified:emM',
      'employee:added:emA',
      'employee:removed:emR',
      // group 群組
      'group:modified:grM',
      'group:added:grA',
      'group:removed:grR',
    ]);

    // 計數：10 個實體（assignment 4：2 modified＋1 added＋1 removed；employee 3；group 3）。
    expect(result.totalEntities).toBe(10);
    expect(result.entries).toHaveLength(10);
    // totalFieldChanges：兩筆 assignment modified（各 1 個 level change）＋ emM 名稱 ＋ grM 組名 ＝ 4。
    // added/removed 的 fields 為 []，不計。
    expect(result.totalFieldChanges).toBe(4);
  });

  it('base===draft 無異動：entries 空、計數為 0', () => {
    const base = makeOrgData({ employees: [emp('e1', { name: '同' })] });
    const draft = makeOrgData({ employees: [emp('e1', { name: '同' })] });

    const result = computeFieldDiff(base, draft);
    expect(result.entries).toEqual([]);
    expect(result.totalEntities).toBe(0);
    expect(result.totalFieldChanges).toBe(0);
  });
});

describe('sessionChangeEntries', () => {
  it('回傳 draft prepend 的新條目（newest-first），不含 base 既有', () => {
    const baseLog: ChangeEntry[] = [
      {
        id: 'old2',
        timestamp: '2026-01-02T00:00:00.000Z',
        operator: 'op',
        changeType: 'employee_create',
        summary: '舊2',
      },
      {
        id: 'old1',
        timestamp: '2026-01-01T00:00:00.000Z',
        operator: 'op',
        changeType: 'employee_create',
        summary: '舊1',
      },
    ];
    const base = makeOrgData({ changeLog: baseLog });
    // draft 在前面 prepend 3 筆新的（newest-first）。
    const newOnes: ChangeEntry[] = [
      {
        id: 'new3',
        timestamp: '2026-02-03T00:00:00.000Z',
        operator: 'op',
        changeType: 'assignment_update',
        summary: '新3',
      },
      {
        id: 'new2',
        timestamp: '2026-02-02T00:00:00.000Z',
        operator: 'op',
        changeType: 'group_update',
        summary: '新2',
      },
      {
        id: 'new1',
        timestamp: '2026-02-01T00:00:00.000Z',
        operator: 'op',
        changeType: 'employee_update',
        summary: '新1',
      },
    ];
    const draft = makeOrgData({ changeLog: [...newOnes, ...baseLog] });

    const result = sessionChangeEntries(base, draft);
    expect(result.map((c) => c.id)).toEqual(['new3', 'new2', 'new1']);
    // 不含 base 既有 id。
    expect(result.map((c) => c.id)).not.toContain('old1');
    expect(result.map((c) => c.id)).not.toContain('old2');
  });

  it('無新增（draft.changeLog === base.changeLog）→ 回 []', () => {
    const log: ChangeEntry[] = [
      {
        id: 'x1',
        timestamp: '2026-01-01T00:00:00.000Z',
        operator: 'op',
        changeType: 'import',
        summary: '匯入',
      },
    ];
    const base = makeOrgData({ changeLog: log });
    const draft = makeOrgData({ changeLog: [...log] });
    expect(sessionChangeEntries(base, draft)).toEqual([]);
  });
});

describe('diffChangeEntryFields', () => {
  /** 解析名稱用的 org（base==draft），含 A/B 員工、g1/g2 組。 */
  function resolverOrg(): OrgData {
    return makeOrgData({
      employees: [emp('A', { name: '主管甲' }), emp('B', { name: '主管乙' })],
      groups: [group('g1', { name: '研發部' }), group('g2', { name: '行銷部' })],
      jobLevels: [jobLevel('j1', 10)],
    });
  }

  function assignmentEntry(
    before: Assignment,
    after: Assignment,
  ): ChangeEntry {
    return {
      id: 'chg1',
      timestamp: '2026-02-01T00:00:00.000Z',
      operator: 'op',
      changeType: 'assignment_update',
      summary: '改組別',
      before: JSON.stringify(before),
      after: JSON.stringify(after),
    };
  }

  it('帶 assignment JSON before/after：解析出與 computeFieldDiff 一致的欄位級 change', () => {
    const org = resolverOrg();
    const before = assignment('a1', {
      employeeId: 'A',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: [],
      primarySupervisorId: null,
    });
    const after: Assignment = { ...before, groupId: 'g2' };
    const entry = assignmentEntry(before, after);

    const fields = diffChangeEntryFields(entry, org, org);
    const groupChange = fieldByKey(fields, 'groupId')!;
    expect(groupChange.label).toBe('組別');
    expect(groupChange.before).toBe('研發部');
    expect(groupChange.after).toBe('行銷部');
  });

  it('entry 缺 before/after → 回 []', () => {
    const org = resolverOrg();
    const entry: ChangeEntry = {
      id: 'chg2',
      timestamp: '2026-02-01T00:00:00.000Z',
      operator: 'op',
      changeType: 'employee_create',
      summary: '新增員工',
      // 無 before/after。
    };
    expect(diffChangeEntryFields(entry, org, org)).toEqual([]);
  });

  it('before/after JSON parse 失敗 → 回 []', () => {
    const org = resolverOrg();
    const entry: ChangeEntry = {
      id: 'chg3',
      timestamp: '2026-02-01T00:00:00.000Z',
      operator: 'op',
      changeType: 'assignment_update',
      summary: '壞資料',
      before: '{not-json',
      after: '{also-bad',
    };
    expect(diffChangeEntryFields(entry, org, org)).toEqual([]);
  });

  it('形狀不像 assignment（無 supervisorIds 陣列）→ 回 []', () => {
    const org = resolverOrg();
    // 用 employee JSON 假裝 before/after（無 supervisorIds 陣列）。
    const entry: ChangeEntry = {
      id: 'chg4',
      timestamp: '2026-02-01T00:00:00.000Z',
      operator: 'op',
      changeType: 'employee_update',
      summary: '更新員工',
      before: JSON.stringify(emp('A', { name: '甲' })),
      after: JSON.stringify(emp('A', { name: '乙' })),
    };
    expect(diffChangeEntryFields(entry, org, org)).toEqual([]);
  });
});
