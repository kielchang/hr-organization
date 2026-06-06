import {
  loadDataVersions,
  pickDefaultVersionId,
  publishedVersionToInfo,
  type DataVersionInfo,
} from './dataVersions';
import type { PublishedVersion } from './publishedVersions';
import { makeOrgData } from '../test/fixtures';

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
});
