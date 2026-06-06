import {
  detectReportingCycleFromAssignments,
  getActiveEmployees,
  validateAssignment,
  validateOrgData,
} from './validators';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

describe('validateAssignment', () => {
  const base = makeOrgData({
    employees: [emp('e1'), emp('e2'), emp('e3', { status: 'inactive' })],
    groups: [group('g1'), group('g2', { status: 'inactive' })],
    jobLevels: [jobLevel('j1', 10)],
  });

  it('合法歸屬無錯誤', () => {
    const a = assignment('a1', { employeeId: 'e1', groupId: 'g1', jobLevelId: 'j1' });
    expect(validateAssignment(a, { ...base, assignments: [a] }, 'a1')).toEqual([]);
  });

  it('找不到員工 / 組別 / 職級', () => {
    const a = assignment('a1', { employeeId: 'x', groupId: 'y', jobLevelId: 'z' });
    const errors = validateAssignment(a, base);
    expect(errors).toContain('找不到員工');
    expect(errors).toContain('找不到組別');
    expect(errors).toContain('找不到職級');
  });

  it('停用組別不可維護歸屬', () => {
    const a = assignment('a1', { employeeId: 'e1', groupId: 'g2', jobLevelId: 'j1' });
    expect(validateAssignment(a, base)).toContain('組別已停用，無法新增或維護歸屬');
  });

  it('同員工同組別重複', () => {
    const existing = assignment('a1', { employeeId: 'e1', groupId: 'g1' });
    const dup = assignment('a2', { employeeId: 'e1', groupId: 'g1' });
    const data = { ...base, assignments: [existing] };
    expect(validateAssignment(dup, data)).toContain('同一員工在此組別已有歸屬紀錄');
  });

  it('主管不可為本人', () => {
    const a = assignment('a1', { employeeId: 'e1', supervisorIds: ['e1'], primarySupervisorId: 'e1' });
    expect(validateAssignment(a, base)).toContain('主管不可為本人');
  });

  it('非在職主管被擋下', () => {
    const a = assignment('a1', { employeeId: 'e1', supervisorIds: ['e3'], primarySupervisorId: 'e3' });
    expect(validateAssignment(a, base)).toContain('主管 e3 非在職狀態');
  });

  it('主主管須在主管清單內', () => {
    const a = assignment('a1', { employeeId: 'e1', supervisorIds: ['e2'], primarySupervisorId: 'e3' });
    expect(validateAssignment(a, base)).toContain('主主管必須包含在主管清單中');
  });
});

describe('detectReportingCycleFromAssignments', () => {
  it('無循環時回空陣列', () => {
    const as = [
      assignment('a1', { employeeId: 'boss', supervisorIds: [] }),
      assignment('a2', { employeeId: 'staff', supervisorIds: ['boss'] }),
    ];
    expect(detectReportingCycleFromAssignments(as)).toEqual([]);
  });

  it('偵測出循環匯報', () => {
    const as = [
      assignment('a1', { employeeId: 'x', supervisorIds: ['y'] }),
      assignment('a2', { employeeId: 'y', supervisorIds: ['x'] }),
    ];
    const errors = detectReportingCycleFromAssignments(as);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/循環匯報/);
  });
});

describe('validateOrgData', () => {
  it('上層組別不存在會報錯', () => {
    const data = makeOrgData({
      groups: [group('g1', { parentId: 'ghost' })],
    });
    expect(validateOrgData(data)).toContain('組別 g1 的上層組別不存在');
  });

  describe('雙維度（部門／職能）規則', () => {
    // 規則 (a)：department 的 parentId 須指向 department
    it('部門上層指向職能 → 報錯', () => {
      const data = makeOrgData({
        groups: [
          group('fn', { name: '職能甲', kind: 'function' }),
          group('dept', { name: '部門乙', kind: 'department', parentId: 'fn' }),
        ],
      });
      expect(validateOrgData(data)).toContain(
        '部門 部門乙 的上層組別 職能甲 必須為部門',
      );
    });

    it('部門上層指向部門 → 通過（不報該錯）', () => {
      const data = makeOrgData({
        groups: [
          group('parent', { name: '上層部門', kind: 'department' }),
          group('child', { name: '下層部門', kind: 'department', parentId: 'parent' }),
        ],
      });
      const errors = validateOrgData(data);
      expect(errors.some((e) => e.includes('必須為部門'))).toBe(false);
    });

    // 規則 (b)：function 不可有 parentId
    it('職能設定上層 → 報錯', () => {
      const data = makeOrgData({
        groups: [
          group('dept', { name: '某部門', kind: 'department' }),
          group('fn', { name: '某職能', kind: 'function', parentId: 'dept' }),
        ],
      });
      expect(validateOrgData(data)).toContain(
        '職能 某職能 不可設定上層組別（職能於 v1 為扁平結構）',
      );
    });

    it('職能 parentId=null → 通過（邊界）', () => {
      const data = makeOrgData({
        groups: [group('fn', { name: '某職能', kind: 'function', parentId: null })],
      });
      const errors = validateOrgData(data);
      expect(errors.some((e) => e.includes('不可設定上層組別'))).toBe(false);
    });

    // 規則 (c)：isPrimaryGroup 的 group 須為 department
    it('主歸屬指向職能 → 報錯', () => {
      const data = makeOrgData({
        employees: [emp('e1')],
        groups: [group('fn', { name: '職能組', kind: 'function' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('a1', {
            employeeId: 'e1',
            groupId: 'fn',
            jobLevelId: 'j1',
            isPrimaryGroup: true,
          }),
        ],
      });
      expect(validateOrgData(data)).toContain(
        '員工 e1 的主歸屬指向職能 職能組，主歸屬應為部門',
      );
    });

    it('主歸屬指向部門 → 通過（不報主歸屬錯）', () => {
      const data = makeOrgData({
        employees: [emp('e1')],
        groups: [group('dept', { name: '部門組', kind: 'department' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('a1', {
            employeeId: 'e1',
            groupId: 'dept',
            jobLevelId: 'j1',
            isPrimaryGroup: true,
          }),
        ],
      });
      const errors = validateOrgData(data);
      expect(errors.some((e) => e.includes('主歸屬應為部門'))).toBe(false);
    });

    it('非主歸屬指向職能 → 不報主歸屬錯（只擋主歸屬）', () => {
      const data = makeOrgData({
        employees: [emp('e1')],
        groups: [group('fn', { name: '職能組', kind: 'function' })],
        jobLevels: [jobLevel('j1', 10)],
        assignments: [
          assignment('a1', {
            employeeId: 'e1',
            groupId: 'fn',
            jobLevelId: 'j1',
            isPrimaryGroup: false,
          }),
        ],
      });
      const errors = validateOrgData(data);
      expect(errors.some((e) => e.includes('主歸屬應為部門'))).toBe(false);
    });
  });
});

describe('getActiveEmployees', () => {
  it('只回傳在職員工', () => {
    const list = [emp('e1'), emp('e2', { status: 'inactive' })];
    expect(getActiveEmployees(list).map((e) => e.id)).toEqual(['e1']);
  });
});
