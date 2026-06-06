import {
  createEmptyAssignment,
  deleteAssignment,
  deleteEmployee,
  importOrgData,
  upsertAssignment,
  upsertEmployee,
  upsertGroup,
} from './orgOperations';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

const OP = 'tester';

describe('upsertEmployee', () => {
  it('新增員工並寫入 changelog', () => {
    const { data, error } = upsertEmployee(makeOrgData(), emp('e1', { employeeNo: 'E001' }), OP, true);
    expect(error).toBeUndefined();
    expect(data.employees).toHaveLength(1);
    expect(data.changeLog[0].changeType).toBe('employee_create');
    expect(data.changeLog[0].operator).toBe(OP);
  });

  it('工號重複時報錯且不變動', () => {
    const base = makeOrgData({ employees: [emp('e1', { employeeNo: 'E001' })] });
    const { data, error } = upsertEmployee(base, emp('e2', { employeeNo: 'E001' }), OP, true);
    expect(error).toBe('工號已存在');
    expect(data).toBe(base);
  });

  it('更新既有員工', () => {
    const base = makeOrgData({ employees: [emp('e1', { name: '舊' })] });
    const { data } = upsertEmployee(base, emp('e1', { name: '新' }), OP, false);
    expect(data.employees[0].name).toBe('新');
    expect(data.changeLog[0].changeType).toBe('employee_update');
  });
});

describe('deleteEmployee', () => {
  it('刪除員工並清掉其歸屬與他人對其的主管參照', () => {
    const base = makeOrgData({
      employees: [emp('boss'), emp('staff')],
      assignments: [
        assignment('a-boss', { employeeId: 'boss' }),
        assignment('a-staff', { employeeId: 'staff', supervisorIds: ['boss'], primarySupervisorId: 'boss' }),
      ],
    });
    const data = deleteEmployee(base, 'boss', OP);
    expect(data.employees.map((e) => e.id)).toEqual(['staff']);
    expect(data.assignments.find((a) => a.id === 'a-boss')).toBeUndefined();
    const staff = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(staff.supervisorIds).toEqual([]);
    expect(staff.primarySupervisorId).toBeNull();
    expect(data.changeLog[0].changeType).toBe('employee_delete');
  });
});

describe('upsertGroup', () => {
  it('自己設為上層會報錯', () => {
    const g = group('g1', { parentId: 'g1' });
    const { error } = upsertGroup(makeOrgData(), g, OP, false);
    expect(error).toBe('組別不可將自己設為上層');
  });

  it('新增組別代碼重複報錯', () => {
    const base = makeOrgData({ groups: [group('g1', { code: 'HR' })] });
    const { error } = upsertGroup(base, group('g2', { code: 'HR' }), OP, true);
    expect(error).toBe('組別代碼已存在');
  });

  it('新增成功寫入 changelog', () => {
    const { data, error } = upsertGroup(makeOrgData(), group('g1', { code: 'HR' }), OP, true);
    expect(error).toBeUndefined();
    expect(data.groups).toHaveLength(1);
    expect(data.changeLog[0].changeType).toBe('group_create');
  });
});

describe('upsertAssignment', () => {
  const base = makeOrgData({
    employees: [emp('e1'), emp('mgr')],
    groups: [group('g1'), group('g2')],
    jobLevels: [jobLevel('j1', 10)],
  });

  it('驗證失敗時回傳錯誤', () => {
    const bad = assignment('a1', { employeeId: 'ghost', groupId: 'g1', jobLevelId: 'j1' });
    const { error } = upsertAssignment(base, bad, OP, true);
    expect(error).toBeTruthy();
  });

  it('新增主組別會把同員工其他歸屬的 isPrimaryGroup 取消', () => {
    const withExisting = {
      ...base,
      assignments: [
        assignment('a-old', { employeeId: 'e1', groupId: 'g1', jobLevelId: 'j1', isPrimaryGroup: true }),
      ],
    };
    const next = assignment('a-new', { employeeId: 'e1', groupId: 'g2', jobLevelId: 'j1', isPrimaryGroup: true });
    const { data, error } = upsertAssignment(withExisting, next, OP, true);
    expect(error).toBeUndefined();
    expect(data.assignments.find((a) => a.id === 'a-old')!.isPrimaryGroup).toBe(false);
    expect(data.assignments.find((a) => a.id === 'a-new')!.isPrimaryGroup).toBe(true);
    expect(data.changeLog[0].changeType).toBe('assignment_create');
  });

  it('更新歸屬會記錄 before/after', () => {
    const withExisting = {
      ...base,
      assignments: [assignment('a1', { employeeId: 'e1', groupId: 'g1', jobLevelId: 'j1' })],
    };
    const updated = assignment('a1', { employeeId: 'e1', groupId: 'g1', jobLevelId: 'j1', isPrimaryGroup: false });
    const { data } = upsertAssignment(withExisting, updated, OP, false);
    expect(data.changeLog[0].changeType).toBe('assignment_update');
    expect(data.changeLog[0].before).toBeTruthy();
    expect(data.changeLog[0].after).toBeTruthy();
  });
});

describe('deleteAssignment', () => {
  it('刪除歸屬並記錄 before', () => {
    const base = makeOrgData({ assignments: [assignment('a1', { employeeId: 'e1' })] });
    const data = deleteAssignment(base, 'a1', OP);
    expect(data.assignments).toEqual([]);
    expect(data.changeLog[0].changeType).toBe('assignment_delete');
    expect(data.changeLog[0].before).toBeTruthy();
  });
});

describe('importOrgData / createEmptyAssignment', () => {
  it('importOrgData 追加 import changelog', () => {
    const data = importOrgData(makeOrgData(), OP);
    expect(data.changeLog[0].changeType).toBe('import');
  });

  it('createEmptyAssignment 產生空白歸屬', () => {
    const a = createEmptyAssignment('e1');
    expect(a.employeeId).toBe('e1');
    expect(a.isPrimaryGroup).toBe(false);
    expect(a.supervisorIds).toEqual([]);
    expect(a.id).toMatch(/^a_/);
  });
});
