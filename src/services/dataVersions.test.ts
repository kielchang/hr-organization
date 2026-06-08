import {
  apiVersionToInfo,
  loadDataVersions,
  pickDefaultVersionId,
  pickLatestRemoteVersionId,
  publishedVersionToInfo,
  type DataVersionInfo,
} from './dataVersions';
import type { ApiVersion } from './apiClient';
import type { PublishedVersion } from './publishedVersions';
import { assignment, emp, group, jobLevel, makeOrgData } from '../test/fixtures';

function info(partial: Partial<DataVersionInfo>): DataVersionInfo {
  return {
    id: 'x',
    filename: 'x.json',
    label: 'x',
    valid: true,
    errors: [],
    data: makeOrgData(),
    contentVersion: 1,
    exportedAt: '',
    isSeed: false,
    source: 'mock',
    ...partial,
  };
}

describe('loadDataVersions', () => {
  it('內建 seed 版本排第一、有效且帶資料', () => {
    const versions = loadDataVersions();
    expect(versions[0].id).toBe('org-data');
    expect(versions[0].isSeed).toBe(true);
    expect(versions[0].source).toBe('seed');
    expect(versions[0].valid).toBe(true);
    expect(versions[0].data.employees.length).toBeGreaterThan(0);
    expect(versions[0].label).toMatch(/^初始/);
  });
});

describe('pickDefaultVersionId', () => {
  it('優先選有效的 org-data', () => {
    const list = [info({ id: 'mock-a' }), info({ id: 'org-data' })];
    expect(pickDefaultVersionId(list)).toBe('org-data');
  });

  it('org-data 無效時退而選第一個有效版本', () => {
    const list = [info({ id: 'org-data', valid: false }), info({ id: 'mock-a', valid: true })];
    expect(pickDefaultVersionId(list)).toBe('mock-a');
  });

  it('全部無效時退回第一個', () => {
    const list = [info({ id: 'a', valid: false }), info({ id: 'b', valid: false })];
    expect(pickDefaultVersionId(list)).toBe('a');
  });

  it('空清單回空字串', () => {
    expect(pickDefaultVersionId([])).toBe('');
  });
});

describe('publishedVersionToInfo', () => {
  it('將發布版本轉成下拉資訊（標籤前綴「發布」、升級 schema）', () => {
    const pv: PublishedVersion = {
      id: 'pub-123',
      label: '我的版本',
      publishedAt: '2026-03-03T00:00:00.000Z',
      // 故意給缺 schemaVersion 的舊資料，驗證會被 migrate
      data: { contentVersion: 2, employees: [], groups: [], assignments: [] } as unknown as PublishedVersion['data'],
    };
    const out = publishedVersionToInfo(pv);
    expect(out.id).toBe('pub-123');
    expect(out.source).toBe('published');
    expect(out.label).toBe('發布 · 我的版本');
    expect(out.data.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(out.valid).toBe(true);
  });

  it('帶入調整理由（note）到 DataVersionInfo', () => {
    const pv: PublishedVersion = {
      id: 'pub-note',
      label: '有理由版',
      publishedAt: '2026-03-03T00:00:00.000Z',
      data: makeOrgData(),
      note: '整併重疊職能',
    };
    expect(publishedVersionToInfo(pv).note).toBe('整併重疊職能');
  });

  it('無 note 的舊發布版本轉換後 note 為 undefined', () => {
    const pv: PublishedVersion = {
      id: 'pub-nonote',
      label: '舊版本',
      publishedAt: '2026-03-03T00:00:00.000Z',
      data: makeOrgData(),
    };
    expect(publishedVersionToInfo(pv).note).toBeUndefined();
  });
});

describe('apiVersionToInfo', () => {
  it('將後端版本轉成下拉資訊（標籤前綴「雲端」、升級 schema）', () => {
    const v: ApiVersion = {
      id: 'ver-abc',
      label: '雲端版本',
      publishedAt: '2026-04-04T00:00:00.000Z',
      data: { contentVersion: 3, employees: [], groups: [], assignments: [] } as unknown as ApiVersion['data'],
    };
    const out = apiVersionToInfo(v);
    expect(out.id).toBe('ver-abc');
    expect(out.label).toBe('雲端 · 雲端版本');
    expect(out.source).toBe('published');
    expect(out.data.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(out.valid).toBe(true);
  });

  it('回傳的 data 與輸入不共用參照（深拷貝，防污染後端版本物件）', () => {
    const v: ApiVersion = {
      id: 'ver-clone',
      label: '深拷貝版',
      publishedAt: '2026-04-04T00:00:00.000Z',
      // 已是當前 schemaVersion=3 的資料，帶實際內容（含 assignment）。
      data: makeOrgData({
        employees: [emp('e1')],
        groups: [group('g1')],
        jobLevels: [jobLevel('j1', 1)],
        assignments: [assignment('a1')],
      }),
    };

    const out = apiVersionToInfo(v);

    // 1) 頂層與巢狀陣列都不共用參照。
    expect(out.data).not.toBe(v.data);
    expect(out.data.assignments).not.toBe(v.data.assignments);
    expect(out.data.assignments[0]).not.toBe(v.data.assignments[0]);
    expect(out.data.employees).not.toBe(v.data.employees);
    expect(out.data.groups).not.toBe(v.data.groups);

    // 2) 內容相等（clone+migrate 未改變語意；資料已是 v3 故與輸入一致）。
    expect(out.data).toEqual(v.data);
    expect(out.data.employees).toEqual(v.data.employees);
    expect(out.data.assignments).toEqual(v.data.assignments);

    // 3) mutate 回傳的 data 不會回頭污染輸入的 ApiVersion.data。
    out.data.assignments[0].groupId = 'mutated';
    out.data.employees.push(emp('e2'));
    expect(v.data.assignments[0].groupId).toBe('g1');
    expect(v.data.employees).toHaveLength(1);
  });
});

describe('pickLatestRemoteVersionId', () => {
  it('多筆時依 exportedAt 取最新（最大時間）', () => {
    const list = [
      info({ id: 'a', exportedAt: '2026-01-01T00:00:00.000Z' }),
      info({ id: 'c', exportedAt: '2026-03-03T00:00:00.000Z' }),
      info({ id: 'b', exportedAt: '2026-02-02T00:00:00.000Z' }),
    ];
    expect(pickLatestRemoteVersionId(list)).toBe('c');
  });

  it('最新筆不在清單尾端時仍正確選出（不只看最後一筆）', () => {
    const list = [
      info({ id: 'newest', exportedAt: '2026-12-31T00:00:00.000Z' }),
      info({ id: 'old', exportedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(pickLatestRemoteVersionId(list)).toBe('newest');
  });

  it('exportedAt 相同時以 id 由大到小作為穩定 tiebreak', () => {
    const list = [
      info({ id: 'aaa', exportedAt: '2026-05-05T00:00:00.000Z' }),
      info({ id: 'zzz', exportedAt: '2026-05-05T00:00:00.000Z' }),
      info({ id: 'mmm', exportedAt: '2026-05-05T00:00:00.000Z' }),
    ];
    expect(pickLatestRemoteVersionId(list)).toBe('zzz');
  });

  it('tiebreak 不受清單順序影響（id 較大者恆勝）', () => {
    const ascending = [
      info({ id: 'aaa', exportedAt: '2026-05-05T00:00:00.000Z' }),
      info({ id: 'zzz', exportedAt: '2026-05-05T00:00:00.000Z' }),
    ];
    const descending = [
      info({ id: 'zzz', exportedAt: '2026-05-05T00:00:00.000Z' }),
      info({ id: 'aaa', exportedAt: '2026-05-05T00:00:00.000Z' }),
    ];
    expect(pickLatestRemoteVersionId(ascending)).toBe('zzz');
    expect(pickLatestRemoteVersionId(descending)).toBe('zzz');
  });

  it('單筆直接回傳該筆 id', () => {
    expect(pickLatestRemoteVersionId([info({ id: 'only', exportedAt: '2026-01-01T00:00:00.000Z' })])).toBe('only');
  });

  it('空清單回 null', () => {
    expect(pickLatestRemoteVersionId([])).toBeNull();
  });

  it('不就地排序（不更動入參順序）', () => {
    const list = [
      info({ id: 'a', exportedAt: '2026-01-01T00:00:00.000Z' }),
      info({ id: 'c', exportedAt: '2026-03-03T00:00:00.000Z' }),
      info({ id: 'b', exportedAt: '2026-02-02T00:00:00.000Z' }),
    ];
    const orderBefore = list.map((v) => v.id);
    pickLatestRemoteVersionId(list);
    expect(list.map((v) => v.id)).toEqual(orderBefore);
  });
});
