import { CSV_MEMBER_COLUMNS, csvMemberRowsToOrgData } from './csvToOrgData';
import { ORG_SCHEMA_VERSION } from './migrations/orgMigrations';

const HEADER = CSV_MEMBER_COLUMNS.join(',');

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('csvMemberRowsToOrgData', () => {
  it('空 CSV 回錯誤', () => {
    const r = csvMemberRowsToOrgData('');
    expect(r.valid).toBe(false);
    expect(r.parseErrors).toContain('資料為空');
  });

  it('缺少必要欄位回錯誤', () => {
    const r = csvMemberRowsToOrgData('employeeNo,employeeName\nE001,王大明');
    expect(r.valid).toBe(false);
    expect(r.parseErrors[0]).toMatch(/缺少必要欄位/);
  });

  it('正常轉換出員工/組別/職級/歸屬', () => {
    const r = csvMemberRowsToOrgData(
      csv(
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
        'E002,李小華,active,HR,人資部,CEO,active,MGR,經理,40,E001,E001,1',
      ),
    );
    expect(r.valid).toBe(true);
    expect(r.data.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(r.data.employees).toHaveLength(2);
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.jobLevels).toHaveLength(2);
    expect(r.data.assignments).toHaveLength(2);

    // 組別階層：HR 的 parent 指向 CEO
    const hr = r.data.groups.find((g) => g.code === 'HR')!;
    const ceo = r.data.groups.find((g) => g.code === 'CEO')!;
    expect(hr.parentId).toBe(ceo.id);

    // 主管以 employeeNo 解析為 employeeId
    const e1 = r.data.employees.find((e) => e.employeeNo === 'E001')!;
    const e2Assign = r.data.assignments.find((a) => a.employeeId.includes('E002'))!;
    expect(e2Assign.supervisorIds).toContain(e1.id);
    expect(e2Assign.primarySupervisorId).toBe(e1.id);
  });

  it('解析在職狀態與布林（停用 / 非主組別）', () => {
    const r = csvMemberRowsToOrgData(
      csv('E003,張三,停用,RD,研發部,,active,ST,專員,10,,,0'),
    );
    expect(r.data.employees[0].status).toBe('inactive');
    expect(r.data.assignments[0].isPrimaryGroup).toBe(false);
  });

  it('以 # 開頭的列視為註解被略過', () => {
    const r = csvMemberRowsToOrgData(
      csv(
        '# 這是註解列',
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
      ),
    );
    expect(r.data.employees).toHaveLength(1);
  });
});
