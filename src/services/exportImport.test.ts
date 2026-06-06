import { parseOrgDataRaw, prepareExport, withUtf8Bom } from './exportImport';
import { ORG_SCHEMA_VERSION } from './migrations/orgMigrations';
import { makeOrgData } from '../test/fixtures';

describe('parseOrgDataRaw', () => {
  it('非物件輸入拋錯', () => {
    expect(() => parseOrgDataRaw(null)).toThrow('無效的組織資料格式');
    expect(() => parseOrgDataRaw('x')).toThrow('無效的組織資料格式');
  });

  it('缺 employees / groups 拋錯', () => {
    expect(() => parseOrgDataRaw({ groups: [], assignments: [] })).toThrow(
      '缺少 employees 或 groups',
    );
  });

  it('缺 assignments 拋錯', () => {
    expect(() => parseOrgDataRaw({ employees: [], groups: [] })).toThrow(
      '缺少 assignments',
    );
  });

  it('合法但缺 schemaVersion 的舊檔會被升級', () => {
    const out = parseOrgDataRaw({
      version: 3, // 舊欄位
      employees: [],
      groups: [],
      assignments: [],
    });
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.contentVersion).toBe(3); // 相容映射到 contentVersion
    expect(out.jobLevels).toEqual([]);
    expect(out.changeLog).toEqual([]);
  });
});

describe('prepareExport', () => {
  it('蓋上目前 schemaVersion 並更新 exportedAt', () => {
    const data = makeOrgData({ schemaVersion: 0, exportedAt: '2020-01-01T00:00:00.000Z' });
    const out = prepareExport(data);
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.exportedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('回傳的是深拷貝，不動到原始資料', () => {
    const data = makeOrgData();
    const out = prepareExport(data);
    expect(out).not.toBe(data);
  });
});

describe('withUtf8Bom', () => {
  it('加上 BOM', () => {
    expect(withUtf8Bom('a').charCodeAt(0)).toBe(0xfeff);
  });

  it('已有 BOM 不重複加', () => {
    const once = withUtf8Bom('a');
    expect(withUtf8Bom(once)).toBe(once);
  });
});
