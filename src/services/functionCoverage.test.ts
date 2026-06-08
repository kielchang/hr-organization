import { buildFunctionCoverage } from './functionCoverage';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

describe('buildFunctionCoverage', () => {
  it('無職能組時回傳空結果', () => {
    const data = makeOrgData({
      employees: [emp('e1')],
      groups: [group('g1', { kind: 'department' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', { employeeId: 'e1', groupId: 'g1', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions).toEqual([]);
    expect(cov.functionsWithoutMembers).toEqual([]);
    expect(cov.functionsWithoutLead).toEqual([]);
    expect(cov.crossFunctionLoad).toEqual([]);
  });

  it('只納入 kind=function 的組別，忽略 department', () => {
    const data = makeOrgData({
      employees: [emp('e1')],
      groups: [
        group('dept', { code: 'DEPT', kind: 'department' }),
        group('fn', { code: 'XFN', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', { employeeId: 'e1', groupId: 'fn', jobLevelId: 'j1' }),
        assignment('a2', { employeeId: 'e1', groupId: 'dept', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions.map((f) => f.group.id)).toEqual(['fn']);
  });

  it('有 lead（任一成員帶 primarySupervisorId）→ hasLead=true，不入無 lead 清單', () => {
    const data = makeOrgData({
      employees: [emp('lead'), emp('member')],
      groups: [group('fn', { code: 'XFN', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-lead', { employeeId: 'lead', groupId: 'fn', jobLevelId: 'j1' }),
        assignment('a-member', {
          employeeId: 'member',
          groupId: 'fn',
          jobLevelId: 'j1',
          supervisorIds: ['lead'],
          primarySupervisorId: 'lead',
        }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions[0].hasLead).toBe(true);
    expect(cov.functionsWithoutLead).toEqual([]);
  });

  it('有成員但無 lead → 入 functionsWithoutLead', () => {
    const data = makeOrgData({
      employees: [emp('m1'), emp('m2')],
      groups: [group('fn', { code: 'XFN', name: '無頭職能', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', { employeeId: 'm1', groupId: 'fn', jobLevelId: 'j1' }),
        assignment('a2', { employeeId: 'm2', groupId: 'fn', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions[0].hasLead).toBe(false);
    expect(cov.functionsWithoutLead.map((g) => g.id)).toEqual(['fn']);
    // 有成員不算覆蓋缺口
    expect(cov.functionsWithoutMembers).toEqual([]);
  });

  it('無成員職能 → 入 functionsWithoutMembers，不入無 lead 清單', () => {
    const data = makeOrgData({
      groups: [group('fn', { code: 'XFN', name: '空職能', kind: 'function' })],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functionsWithoutMembers.map((g) => g.id)).toEqual(['fn']);
    // 無成員不應出現在「有成員但無 lead」清單
    expect(cov.functionsWithoutLead).toEqual([]);
  });

  it('functions 依組別 code 排序', () => {
    const data = makeOrgData({
      groups: [
        group('fb', { code: 'XFN-B', kind: 'function' }),
        group('fa', { code: 'XFN-A', kind: 'function' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions.map((f) => f.group.code)).toEqual(['XFN-A', 'XFN-B']);
  });

  it('crossFunctionLoad：functionCount 降冪、同分依姓名（zh-Hant collation）升冪', () => {
    const data = makeOrgData({
      // 同分姓名用「zh-Hant collation 序」與「Unicode 碼點序」相反的字對，
      // 讓此測試能真正擋住「退回不帶 locale 的 localeCompare」的回歸：
      //   乙 = U+4E59、丙 = U+4E19
      //   Intl.Collator('zh-Hant')：乙 < 丙（collator.compare('乙','丙') < 0）
      //   碼點序 / locale-less localeCompare：丙 < 乙（'乙'.localeCompare('丙') > 0）
      // 期望同分時「乙」排在「丙」之前 → 證明用的是 zh-Hant collator；
      // 若有人把 nameCollator 換回不帶 locale 的 localeCompare，順序會反轉、此測試轉紅。
      employees: [
        emp('e-two', { name: '甲' }),
        emp('e-one-yi', { name: '乙' }),
        emp('e-one-bing', { name: '丙' }),
      ],
      groups: [
        group('fa', { code: 'XFN-A', kind: 'function' }),
        group('fb', { code: 'XFN-B', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        // e-two 跨兩個職能 → functionCount=2，排最前
        assignment('a1', { employeeId: 'e-two', groupId: 'fa', jobLevelId: 'j1' }),
        assignment('a2', { employeeId: 'e-two', groupId: 'fb', jobLevelId: 'j1' }),
        // 乙 / 丙 各一個職能 → functionCount=1，同分依 zh-Hant 序（乙 < 丙）
        assignment('a3', { employeeId: 'e-one-yi', groupId: 'fa', jobLevelId: 'j1' }),
        assignment('a4', { employeeId: 'e-one-bing', groupId: 'fb', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(
      cov.crossFunctionLoad.map((l) => ({
        id: l.employee.id,
        name: l.employee.name,
        count: l.functionCount,
      })),
    ).toEqual([
      { id: 'e-two', name: '甲', count: 2 },
      // 同分：乙 雖碼點大於 丙，zh-Hant 序仍排在丙之前 → 守住中文 collation
      { id: 'e-one-yi', name: '乙', count: 1 },
      { id: 'e-one-bing', name: '丙', count: 1 },
    ]);
  });

  it('crossFunctionLoad：同一職能多筆 assignment 同人去重，每職能計一次', () => {
    const data = makeOrgData({
      employees: [emp('e1', { name: '甲' })],
      groups: [group('fn', { code: 'XFN', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10), jobLevel('j2', 20)],
      assignments: [
        // 同一人在同一職能組有兩筆歸屬，functionCount 仍應為 1
        assignment('a1', { employeeId: 'e1', groupId: 'fn', jobLevelId: 'j1' }),
        assignment('a2', { employeeId: 'e1', groupId: 'fn', jobLevelId: 'j2' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.crossFunctionLoad).toHaveLength(1);
    expect(cov.crossFunctionLoad[0].functionCount).toBe(1);
  });

  it('crossFunctionLoad：functionNames 依組別 code 排序', () => {
    const data = makeOrgData({
      employees: [emp('e1', { name: '甲' })],
      groups: [
        group('fb', { code: 'XFN-B', name: 'B職能', kind: 'function' }),
        group('fa', { code: 'XFN-A', name: 'A職能', kind: 'function' }),
      ],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', { employeeId: 'e1', groupId: 'fb', jobLevelId: 'j1' }),
        assignment('a2', { employeeId: 'e1', groupId: 'fa', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.crossFunctionLoad[0].functionNames).toEqual(['A職能', 'B職能']);
  });

  it('成員清單以 hasSupervisor 標示是否帶 primarySupervisorId', () => {
    const data = makeOrgData({
      employees: [emp('lead'), emp('plain')],
      groups: [group('fn', { code: 'XFN', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a-plain', { employeeId: 'plain', groupId: 'fn', jobLevelId: 'j1' }),
        assignment('a-lead', {
          employeeId: 'lead',
          groupId: 'fn',
          jobLevelId: 'j1',
          supervisorIds: ['plain'],
          primarySupervisorId: 'plain',
        }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    const byEmp = new Map(
      cov.functions[0].members.map((m) => [m.employee.id, m.hasSupervisor]),
    );
    expect(byEmp.get('lead')).toBe(true);
    expect(byEmp.get('plain')).toBe(false);
  });

  it('忽略指向不存在員工的 assignment', () => {
    const data = makeOrgData({
      groups: [group('fn', { code: 'XFN', kind: 'function' })],
      jobLevels: [jobLevel('j1', 10)],
      assignments: [
        assignment('a1', { employeeId: 'ghost', groupId: 'fn', jobLevelId: 'j1' }),
      ],
    });
    const cov = buildFunctionCoverage(data);
    expect(cov.functions[0].members).toEqual([]);
    expect(cov.functionsWithoutMembers.map((g) => g.id)).toEqual(['fn']);
  });
});
