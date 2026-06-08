import {
  CSV_MEMBER_COLUMNS,
  CSV_MEMBER_COLUMNS_ZH,
  csvColumnZh,
  csvMemberRowsToOrgData,
  orgDataToCsvMemberRows,
} from './csvToOrgData';
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

// R5.3 CSV 欄位中文化：中文為主、英文向後相容。
describe('R5.3 CSV 欄位中文化 — header 解析', () => {
  it('中文 header 可成功解析（員工/組別/歸屬數正確）', () => {
    // 中文 header 字面（不靠常數）以證明對應表內容正確。
    const zhHeader =
      '員工工號,員工姓名,在職狀態,組別代碼,組別名稱,上層組別代碼,組別狀態,職級代碼,職級名稱,職級層級,主管工號,直屬主管工號,是否主要組別';
    const r = csvMemberRowsToOrgData(
      [
        zhHeader,
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
        'E002,李小華,active,HR,人資部,CEO,active,MGR,經理,40,E001,E001,1',
      ].join('\n'),
    );
    expect(r.valid).toBe(true);
    expect(r.parseErrors).toEqual([]);
    expect(r.data.employees).toHaveLength(2);
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.assignments).toHaveLength(2);

    // 中文 header 解析出的語意與英文一致：HR parent 指向 CEO、主管以工號解析。
    const hr = r.data.groups.find((g) => g.code === 'HR')!;
    const ceo = r.data.groups.find((g) => g.code === 'CEO')!;
    expect(hr.parentId).toBe(ceo.id);
    const e1 = r.data.employees.find((e) => e.employeeNo === 'E001')!;
    const e2Assign = r.data.assignments.find((a) =>
      a.employeeId.includes('E002'),
    )!;
    expect(e2Assign.supervisorIds).toContain(e1.id);
    expect(e2Assign.primarySupervisorId).toBe(e1.id);
  });

  it('英文 header 仍向後相容（既有檔案不壞）', () => {
    const r = csvMemberRowsToOrgData(
      csv(
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
        'E002,李小華,active,HR,人資部,CEO,active,MGR,經理,40,E001,E001,1',
      ),
    );
    expect(r.valid).toBe(true);
    expect(r.data.employees).toHaveLength(2);
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.assignments).toHaveLength(2);
  });

  it('英文 header 大小寫不敏感（EMPLOYEENO 等）', () => {
    const upperHeader = HEADER.toUpperCase();
    const r = csvMemberRowsToOrgData(
      [
        upperHeader,
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
      ].join('\n'),
    );
    expect(r.valid).toBe(true);
    expect(r.data.employees).toHaveLength(1);
  });

  it('中英混用 header 每欄獨立比對（皆正確對應）', () => {
    // 前半中文、後半英文，刻意交錯以證明每欄獨立。
    const mixedHeader =
      '員工工號,employeeName,在職狀態,groupCode,組別名稱,parentGroupCode,組別狀態,jobLevelCode,職級名稱,jobLevelRank,主管工號,primarySupervisorEmployeeNo,是否主要組別';
    const r = csvMemberRowsToOrgData(
      [
        mixedHeader,
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
        'E002,李小華,active,HR,人資部,CEO,active,MGR,經理,40,E001,E001,1',
      ].join('\n'),
    );
    expect(r.valid).toBe(true);
    expect(r.parseErrors).toEqual([]);
    expect(r.data.employees).toHaveLength(2);
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.assignments).toHaveLength(2);

    // 確認混用下欄位語意仍正確（非只是欄數對）。
    const hr = r.data.groups.find((g) => g.code === 'HR')!;
    const ceo = r.data.groups.find((g) => g.code === 'CEO')!;
    expect(hr.parentId).toBe(ceo.id);
    const e2Assign = r.data.assignments.find((a) =>
      a.employeeId.includes('E002'),
    )!;
    expect(e2Assign.isPrimaryGroup).toBe(true);
  });

  it('中文 header 缺欄位 → 錯誤訊息列中文欄名（非英文 key）', () => {
    // 故意拿掉「員工工號」一欄。
    const missingZhHeader =
      '員工姓名,在職狀態,組別代碼,組別名稱,上層組別代碼,組別狀態,職級代碼,職級名稱,職級層級,主管工號,直屬主管工號,是否主要組別';
    const r = csvMemberRowsToOrgData(
      [missingZhHeader, '王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1'].join(
        '\n',
      ),
    );
    expect(r.valid).toBe(false);
    const msg = r.parseErrors.find((e) => e.includes('缺少必要欄位'))!;
    expect(msg).toBeDefined();
    // 列中文欄名「員工工號」，且不得出現英文 key。
    expect(msg).toContain('員工工號');
    expect(msg).not.toContain('employeeNo');
  });
});

describe('R5.3 CSV 欄位中文化 — 匯出與 round-trip', () => {
  function buildData() {
    const r = csvMemberRowsToOrgData(
      csv(
        'E001,王大明,active,CEO,總經理室,,active,DIR,總監,50,,,1',
        'E002,李小華,inactive,HR,人資部,CEO,active,MGR,經理,40,E001,E001,0',
      ),
    );
    expect(r.valid).toBe(true);
    return r.data;
  }

  it('匯出 header 為中文欄名（非英文 key）', () => {
    const out = orgDataToCsvMemberRows(buildData());
    const headerLine = out.split('\n')[0];

    // 含關鍵中文欄名。
    expect(headerLine).toContain('員工工號');
    expect(headerLine).toContain('員工姓名');
    expect(headerLine).toContain('是否主要組別');
    expect(headerLine).toContain('直屬主管工號');

    // 不再使用英文 key 當 header。
    expect(headerLine).not.toContain('employeeNo');
    expect(headerLine).not.toContain('isPrimaryGroup');

    // header 應等於 CSV_MEMBER_COLUMNS_ZH 的順序組合。
    expect(headerLine).toBe(CSV_MEMBER_COLUMNS_ZH.join(','));
    // 第一欄的中文主名與對應表一致。
    expect(headerLine.split(',')[0]).toBe(csvColumnZh('employeeNo'));
  });

  it('round-trip：data → 匯出（中文 header）→ 匯入 一致且 valid', () => {
    const original = buildData();
    const exported = orgDataToCsvMemberRows(original);
    const reimported = csvMemberRowsToOrgData(exported);

    expect(reimported.valid).toBe(true);
    expect(reimported.parseErrors).toEqual([]);
    expect(reimported.data.employees).toHaveLength(original.employees.length);
    expect(reimported.data.groups).toHaveLength(original.groups.length);
    expect(reimported.data.assignments).toHaveLength(
      original.assignments.length,
    );

    // 語意保真：狀態與布林等值在 round-trip 後不變。
    const e2 = reimported.data.employees.find((e) => e.employeeNo === 'E002')!;
    expect(e2.status).toBe('inactive');
    const a2 = reimported.data.assignments.find((a) =>
      a.employeeId.includes('E002'),
    )!;
    expect(a2.isPrimaryGroup).toBe(false);
    // 主管關係在 round-trip 後仍解析得到。
    const e1 = reimported.data.employees.find((e) => e.employeeNo === 'E001')!;
    expect(a2.primarySupervisorId).toBe(e1.id);
  });
});
