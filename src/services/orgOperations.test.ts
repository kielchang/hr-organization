import {
  createEmptyAssignment,
  deleteAssignment,
  deleteEmployee,
  importOrgData,
  reassignEmployeeGroup,
  reassignSupervisor,
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

describe('reassignSupervisor（拖人改匯報線）', () => {
  /**
   * 共用底圖：員工 oldBoss / newBoss / dotted / staff，皆 active；
   * 部門 g1、職級 j1。各案再覆寫 staff 的歸屬。
   */
  function reassignBase(staffAssignment: ReturnType<typeof assignment>) {
    return makeOrgData({
      employees: [emp('oldBoss'), emp('newBoss'), emp('dotted'), emp('staff')],
      groups: [group('g1', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAssignment],
    });
  }

  it('成功改主管：拖 staff 到 newBoss → primarySupervisorId=newBoss、supervisorIds 含 newBoss、error null', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.primarySupervisorId).toBe('newBoss');
    expect(updated.supervisorIds).toContain('newBoss');
    // 舊主主管被換掉
    expect(updated.supervisorIds).not.toContain('oldBoss');
    // 走 upsertAssignment → 寫入 assignment_update changelog
    expect(data.changeLog[0].changeType).toBe('assignment_update');
  });

  it('保留 dotted：原 [oldBoss(primary), dotted] → reassign newBoss → 去 oldBoss、含 newBoss、保留 dotted、primary=newBoss', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss', 'dotted'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.primarySupervisorId).toBe('newBoss');
    expect(updated.supervisorIds).not.toContain('oldBoss');
    expect(updated.supervisorIds).toContain('newBoss');
    // dotted（虛線）主管保留
    expect(updated.supervisorIds).toContain('dotted');
    expect(updated.supervisorIds).toHaveLength(2);
  });

  it('newSupervisorId 原本是 dotted：提升為 primary 且不重複出現', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss', 'dotted'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    // 把原本的 dotted 提升為新主主管
    const { data, error } = reassignSupervisor(base, 'a-staff', 'dotted', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.primarySupervisorId).toBe('dotted');
    // 去掉舊 primary（oldBoss）
    expect(updated.supervisorIds).not.toContain('oldBoss');
    // dotted 不重複（只出現一次）
    expect(updated.supervisorIds.filter((s) => s === 'dotted')).toHaveLength(1);
    expect(updated.supervisorIds).toEqual(['dotted']);
  });

  it('循環擋：newBoss 已匯報給 staff（B→A），reassign A→B 會成 A↔B 循環 → error 非 null、data 為原 data（未套用）', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    // newBoss 的歸屬：主管是 staff（newBoss → staff），形成下屬鏈
    const newBossAss = assignment('a-newBoss', {
      employeeId: 'newBoss',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['staff'],
      primarySupervisorId: 'staff',
    });
    const base = makeOrgData({
      employees: [emp('oldBoss'), emp('newBoss'), emp('staff')],
      groups: [group('g1', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss, newBossAss],
    });

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/循環/);
    // 整筆不套用：回原 data（reference 相等，未產生新物件、未寫 changelog）
    expect(data).toBe(base);
  });

  it('自我指派：newSupervisorId === 被拖者 employeeId → error', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'staff', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/本人/);
    expect(data).toBe(base);
  });

  it('inactive 主管：reassign 到停用員工 → error（validateAssignment 擋）、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    const base = makeOrgData({
      employees: [
        emp('oldBoss'),
        emp('newBoss', { status: 'inactive' }),
        emp('staff'),
      ],
      groups: [group('g1', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/在職/);
    expect(data).toBe(base);
  });

  it('不存在的主管：reassign 到不存在員工 → error（validateAssignment 擋）、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'ghost', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/找不到主管/);
    expect(data).toBe(base);
  });

  it('找不到 assignmentId → error、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'no-such-id', 'newBoss', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/找不到/);
    expect(data).toBe(base);
  });

  it('原本無主管（primarySupervisorId=null）：reassign 仍正確設定且不殘留 null', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: [],
      primarySupervisorId: null,
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.primarySupervisorId).toBe('newBoss');
    expect(updated.supervisorIds).toEqual(['newBoss']);
  });

  it('清除 level 覆寫：成功 reassign 後被拖者的手動層級覆寫被清為 undefined（跟隨新主管計算深度）', () => {
    // 契約（drag-to-reassign）：換主管時清掉舊的垂直拖曳層級覆寫，
    // 讓被拖者跟隨新主管的計算深度，而非殘留手動 level。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
      level: 7, // 既有手動層級覆寫
    });
    const base = reassignBase(staffAss);

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.primarySupervisorId).toBe('newBoss');
    // 核心：手動 level 覆寫被清除（undefined），不殘留 7。
    expect(updated.level).toBeUndefined();
  });

  it('失敗 reassign（循環）不動到 level 覆寫：原 level 保留、data 為原物件', () => {
    // 失敗路徑整筆不套用 → 既有 level 覆寫不應被清掉。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['oldBoss'],
      primarySupervisorId: 'oldBoss',
      level: 7,
    });
    const newBossAss = assignment('a-newBoss', {
      employeeId: 'newBoss',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['staff'],
      primarySupervisorId: 'staff',
    });
    const base = makeOrgData({
      employees: [emp('oldBoss'), emp('newBoss'), emp('staff')],
      groups: [group('g1', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss, newBossAss],
    });

    const { data, error } = reassignSupervisor(base, 'a-staff', 'newBoss', OP);

    expect(error).toMatch(/循環/);
    // 整筆不套用：回原 data，level 覆寫原封不動。
    expect(data).toBe(base);
    expect(data.assignments.find((a) => a.id === 'a-staff')!.level).toBe(7);
  });
});

describe('reassignEmployeeGroup（拖人改組別）', () => {
  /**
   * 共用底圖：員工 staff；組別 g1（原組）、g2（目標組）皆 active；職級 j1。
   * 各案再覆寫 staff 的歸屬與其他組別/歸屬。
   */
  function regroupBase(staffAssignment: ReturnType<typeof assignment>) {
    return makeOrgData({
      employees: [emp('staff'), emp('boss')],
      groups: [
        group('g1', { kind: 'department' }),
        group('g2', { kind: 'department' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAssignment],
    });
  }

  it('成功改組：groupId 改為新組、level 覆寫清為 undefined、error null', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      level: 5, // 既有手動層級覆寫
    });
    const base = regroupBase(staffAss);

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'g2', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.groupId).toBe('g2');
    // 核心：手動 level 覆寫被清為 undefined（換組後跟隨新組計算深度）。
    expect(updated.level).toBeUndefined();
  });

  it('成功改組：changeLog 追加一筆且摘要含「改組別」與員工/組名', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
    });
    const base = makeOrgData({
      employees: [emp('staff', { name: '小明' })],
      groups: [
        group('g1', { kind: 'department', name: '研發部' }),
        group('g2', { kind: 'department', name: '行銷部' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });

    const before = base.changeLog.length;
    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'g2', OP);

    expect(error).toBeNull();
    expect(data.changeLog.length).toBe(before + 1);
    const entry = data.changeLog[0];
    expect(entry.changeType).toBe('assignment_update');
    expect(entry.operator).toBe(OP);
    // 可讀摘要：含「改組別」與員工名、目標組名。
    expect(entry.summary).toContain('改組別');
    expect(entry.summary).toContain('小明');
    expect(entry.summary).toContain('行銷部');
  });

  it('主歸屬拖入職能組擋：isPrimaryGroup 成員 → function 組 → error、data 為原參照、未變動、無新增 changeLog', () => {
    // 主歸屬（home line）只能落在部門。拖入 kind:'function' 的職能組應被擋下，整筆不套用。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      isPrimaryGroup: true,
      level: 5,
    });
    const base = makeOrgData({
      employees: [emp('staff')],
      groups: [
        group('g1', { kind: 'department' }),
        group('gf', { kind: 'function' }), // 職能組
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });
    const beforeLog = base.changeLog.length;

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'gf', OP);

    expect(error).not.toBeNull();
    // 訊息含「主歸屬／職能／部門」其一即可。
    expect(error).toMatch(/主歸屬|職能|部門/);
    // 整筆不套用：回原 data 參照（reference 相等）。
    expect(data).toBe(base);
    // assignments 未變：groupId 仍為原組、level 覆寫原封不動。
    const unchanged = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(unchanged.groupId).toBe('g1');
    expect(unchanged.level).toBe(5);
    // 未新增 changeLog。
    expect(data.changeLog.length).toBe(beforeLog);
  });

  it('次要歸屬拖入職能組允許：isPrimaryGroup:false → function 組 → 成功、groupId 改、level 清', () => {
    // 次要歸屬（dotted/兼任）可落在職能組，不被主歸屬規則誤擋。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      isPrimaryGroup: false,
      level: 5,
    });
    const base = makeOrgData({
      employees: [emp('staff')],
      groups: [
        group('g1', { kind: 'department' }),
        group('gf', { kind: 'function' }), // 職能組
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'gf', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    // 次要歸屬成功落入職能組。
    expect(updated.groupId).toBe('gf');
    // 換組後手動 level 覆寫被清為 undefined。
    expect(updated.level).toBeUndefined();
  });

  it('主歸屬改入另一部門組仍允許：isPrimaryGroup:true → department 組 → 成功套用', () => {
    // 主歸屬規則只擋「非部門」目標；改入另一個部門組應正常成功。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      isPrimaryGroup: true,
    });
    const base = makeOrgData({
      employees: [emp('staff')],
      groups: [
        group('g1', { kind: 'department' }),
        group('g2', { kind: 'department' }), // 另一部門組
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'g2', OP);

    expect(error).toBeNull();
    const updated = data.assignments.find((a) => a.id === 'a-staff')!;
    expect(updated.groupId).toBe('g2');
    // 主歸屬旗標維持不變。
    expect(updated.isPrimaryGroup).toBe(true);
  });

  it('重複歸屬擋：同員工在新組已有歸屬 → error、data 為原物件（未變動）', () => {
    const staffG1 = assignment('a-g1', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
    });
    // staff 在 g2 已有另一筆歸屬。
    const staffG2 = assignment('a-g2', {
      employeeId: 'staff',
      groupId: 'g2',
      jobLevelId: 'j1',
      isPrimaryGroup: false,
    });
    const base = makeOrgData({
      employees: [emp('staff')],
      groups: [
        group('g1', { kind: 'department' }),
        group('g2', { kind: 'department' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffG1, staffG2],
    });

    const { data, error } = reassignEmployeeGroup(base, 'a-g1', 'g2', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/已有歸屬/);
    // 整筆不套用：回原 data（reference 相等、未寫 changeLog）。
    expect(data).toBe(base);
  });

  it('inactive 組擋：目標組已停用 → error、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
    });
    const base = makeOrgData({
      employees: [emp('staff')],
      groups: [
        group('g1', { kind: 'department' }),
        group('g2', { kind: 'department', status: 'inactive' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffAss],
    });

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'g2', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/停用/);
    expect(data).toBe(base);
  });

  it('循環擋：換組後在新顯示集合內形成 A↔B 互報 → error、data 為原 data 參照（未套用）', () => {
    // staff 與 boss 互為主管，但原本在不同組（g1/g2）→ 同組偵測下未成循環。
    // 把 boss 從 g2 改到 g1 後，兩人同在 g1 → 整體匯報關係出現 A↔B 循環。
    // reassignEmployeeGroup 以「整體」匯報關係偵測，故換組這步即被擋。
    const staffG1 = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      supervisorIds: ['boss'],
      primarySupervisorId: 'boss',
    });
    const bossG2 = assignment('a-boss', {
      employeeId: 'boss',
      groupId: 'g2',
      jobLevelId: 'j1',
      supervisorIds: ['staff'],
      primarySupervisorId: 'staff',
    });
    const base = makeOrgData({
      employees: [emp('staff'), emp('boss')],
      groups: [
        group('g1', { kind: 'department' }),
        group('g2', { kind: 'department' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [staffG1, bossG2],
    });

    const { data, error } = reassignEmployeeGroup(base, 'a-boss', 'g1', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/循環/);
    // 整筆不套用：回原 data 參照（未產生新物件、未寫 changeLog）。
    expect(data).toBe(base);
  });

  it('同組 no-op：newGroupId === 原 groupId → 回原 data、error null、changeLog 不增', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      level: 5,
    });
    const base = regroupBase(staffAss);
    const beforeLog = base.changeLog.length;

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'g1', OP);

    expect(error).toBeNull();
    // 同組無實質變更：回原 data 參照（不寫 changeLog、不清 level）。
    expect(data).toBe(base);
    expect(data.changeLog.length).toBe(beforeLog);
    // 未變動 → 既有 level 覆寫原封不動。
    expect(data.assignments.find((a) => a.id === 'a-staff')!.level).toBe(5);
  });

  it('空 assignmentId（co-leader）→ error、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
    });
    const base = regroupBase(staffAss);

    const { data, error } = reassignEmployeeGroup(base, '', 'g2', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/無可調整的歸屬/);
    expect(data).toBe(base);
  });

  it('不存在的 assignmentId → error、data 未變', () => {
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
    });
    const base = regroupBase(staffAss);

    const { data, error } = reassignEmployeeGroup(base, 'no-such-id', 'g2', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/找不到/);
    expect(data).toBe(base);
  });

  it('找不到目標組（newGroupId 不存在）→ error、data 未變', () => {
    // 用次要歸屬（isPrimaryGroup:false）才會走到 validateAssignment 的「找不到組別」路徑；
    // 主歸屬遇到不存在的組會先被「主歸屬只能落在部門」檢查短路（newGroup?.kind !== 'department'）。
    const staffAss = assignment('a-staff', {
      employeeId: 'staff',
      groupId: 'g1',
      jobLevelId: 'j1',
      isPrimaryGroup: false,
    });
    const base = regroupBase(staffAss);

    const { data, error } = reassignEmployeeGroup(base, 'a-staff', 'ghost', OP);

    expect(error).not.toBeNull();
    expect(error).toMatch(/找不到組別/);
    expect(data).toBe(base);
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
