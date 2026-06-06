import * as XLSX from '@e965/xlsx';
import { parseXlsxToMatrix, xlsxToOrgData } from './xlsxToOrgData';
import { CSV_MEMBER_COLUMNS } from './csvToOrgData';

function makeXlsx(rows: string[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  // @e965/xlsx 的 write({type:'array'}) 回傳 ArrayBuffer
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const HEADER = [...CSV_MEMBER_COLUMNS];

describe('parseXlsxToMatrix', () => {
  it('還原工作表為二維字串陣列', () => {
    const buf = makeXlsx([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseXlsxToMatrix(buf)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
});

describe('xlsxToOrgData', () => {
  it('由 Excel 轉出員工/組別/職級/歸屬', () => {
    const buf = makeXlsx([
      HEADER,
      ['E001', '王大明', 'active', 'CEO', '總經理室', '', 'active', 'DIR', '總監', '50', '', '', '1'],
      ['E002', '李小華', 'active', 'HR', '人資部', 'CEO', 'active', 'MGR', '經理', '40', 'E001', 'E001', '1'],
    ]);
    const r = xlsxToOrgData(buf);
    expect(r.valid).toBe(true);
    expect(r.data.employees).toHaveLength(2);
    expect(r.data.groups).toHaveLength(2);
    expect(r.data.jobLevels).toHaveLength(2);
    expect(r.data.assignments).toHaveLength(2);
    const hr = r.data.groups.find((g) => g.code === 'HR')!;
    const ceo = r.data.groups.find((g) => g.code === 'CEO')!;
    expect(hr.parentId).toBe(ceo.id);
  });

  it('缺必要欄位回錯誤', () => {
    const buf = makeXlsx([
      ['employeeNo', 'employeeName'],
      ['E1', '甲'],
    ]);
    const r = xlsxToOrgData(buf);
    expect(r.valid).toBe(false);
    expect(r.parseErrors[0]).toMatch(/缺少必要欄位/);
  });

  it('空白工作表回「資料為空」', () => {
    const buf = makeXlsx([['']]);
    const r = xlsxToOrgData(buf);
    expect(r.valid).toBe(false);
    expect(r.parseErrors).toContain('資料為空');
  });
});
