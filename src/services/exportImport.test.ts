import {
  cloneOrgData,
  downloadCsvText,
  downloadJson,
  downloadOrgData,
  parseOrgDataFile,
  parseOrgDataRaw,
  prepareExport,
  withUtf8Bom,
} from './exportImport';
import { ORG_SCHEMA_VERSION } from './migrations/orgMigrations';
import { makeOrgData } from '../test/fixtures';
import { emp } from '../test/fixtures';

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

describe('cloneOrgData', () => {
  it('深拷貝，巢狀陣列不共用參照', () => {
    const src = makeOrgData({ employees: [emp('e1')] });
    const copy = cloneOrgData(src);
    expect(copy).not.toBe(src);
    expect(copy.employees).not.toBe(src.employees);
    expect(copy.employees[0]).toEqual(src.employees[0]);
  });
});

describe('parseOrgDataFile', () => {
  it('從 File 讀 JSON 並升級 schema', async () => {
    const payload = { contentVersion: 7, employees: [], groups: [], assignments: [] };
    const file = new File([JSON.stringify(payload)], 'org.json', { type: 'application/json' });
    const out = await parseOrgDataFile(file);
    expect(out.schemaVersion).toBe(ORG_SCHEMA_VERSION);
    expect(out.contentVersion).toBe(7);
  });
});

describe('下載輔助（jsdom 模擬）', () => {
  let downloads: { href: string; name: string; size: number }[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloads = [];
    globalThis.URL.createObjectURL = vi.fn((blob: Blob) => {
      downloads.push({ href: 'blob:mock', name: '', size: blob.size });
      return 'blob:mock';
    });
    globalThis.URL.revokeObjectURL = vi.fn();
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (downloads.length) downloads[downloads.length - 1].name = this.download;
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('downloadJson 用指定檔名', () => {
    downloadJson({ a: 1 }, 'x.json');
    expect(downloads[0].name).toBe('x.json');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('downloadOrgData 預設檔名符合 org-data-*.json', () => {
    downloadOrgData(makeOrgData());
    expect(downloads[0].name).toMatch(/^org-data-.*\.json$/);
  });

  it('downloadCsvText 產出 .csv 且內容帶 BOM', () => {
    downloadCsvText('a,b', 'out.csv');
    expect(downloads[0].name).toBe('out.csv');
    expect(downloads[0].size).toBeGreaterThan('a,b'.length); // BOM 多出位元組
  });
});
