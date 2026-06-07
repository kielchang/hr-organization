import {
  PUBLISHED_BUNDLE_KIND,
  addPublishedVersion,
  buildPublishedBundle,
  deletePublishedVersion,
  loadPublishedVersions,
  mergePublishedBundle,
} from './publishedVersions';
import { makeOrgData } from '../test/fixtures';

describe('publishedVersions', () => {
  it('初始為空', () => {
    expect(loadPublishedVersions()).toEqual([]);
  });

  it('新增版本（最新置頂）並持久化', () => {
    const { created } = addPublishedVersion(makeOrgData(), '第一版');
    expect(created.id).toMatch(/^pub-/);
    addPublishedVersion(makeOrgData(), '第二版');
    const list = loadPublishedVersions();
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('第二版'); // 最新置頂
    expect(list[1].label).toBe('第一版');
  });

  it('未給 label 時以時間戳命名', () => {
    const { created } = addPublishedVersion(makeOrgData());
    expect(created.label.length).toBeGreaterThan(0);
  });

  it('可記錄生效日（effectiveDate）', () => {
    const { created } = addPublishedVersion(makeOrgData(), '排程版', '2026-12-31');
    expect(created.effectiveDate).toBe('2026-12-31');
    expect(loadPublishedVersions()[0].effectiveDate).toBe('2026-12-31');
  });

  it('未指定生效日時不帶 effectiveDate', () => {
    const { created } = addPublishedVersion(makeOrgData(), '即時版');
    expect(created.effectiveDate).toBeUndefined();
  });

  it('可記錄調整理由（note）並 trim', () => {
    const { created } = addPublishedVersion(
      makeOrgData(),
      '有理由版',
      undefined,
      '  整併重疊職能  ',
    );
    expect(created.note).toBe('整併重疊職能');
    expect(loadPublishedVersions()[0].note).toBe('整併重疊職能');
  });

  it('note 為空字串或純空白時不存（undefined）', () => {
    const blank = addPublishedVersion(makeOrgData(), '空白理由', undefined, '   ');
    expect(blank.created.note).toBeUndefined();
    const empty = addPublishedVersion(makeOrgData(), '空字串理由', undefined, '');
    expect(empty.created.note).toBeUndefined();
    expect(loadPublishedVersions().every((v) => v.note === undefined)).toBe(true);
  });

  it('未指定 note 時為 undefined', () => {
    const { created } = addPublishedVersion(makeOrgData(), '無理由版');
    expect(created.note).toBeUndefined();
  });

  it('生效日與調整理由可同時記錄', () => {
    const { created } = addPublishedVersion(
      makeOrgData(),
      '完整版',
      '2026-12-31',
      '強化跨部門協作',
    );
    expect(created.effectiveDate).toBe('2026-12-31');
    expect(created.note).toBe('強化跨部門協作');
  });

  it('依 id 刪除', () => {
    const { created } = addPublishedVersion(makeOrgData(), 'A');
    addPublishedVersion(makeOrgData(), 'B');
    const after = deletePublishedVersion(created.id);
    expect(after.some((v) => v.id === created.id)).toBe(false);
    expect(after).toHaveLength(1);
  });

  it('buildPublishedBundle 帶 kind 與 versions', () => {
    addPublishedVersion(makeOrgData(), 'A');
    const bundle = buildPublishedBundle();
    expect(bundle.kind).toBe(PUBLISHED_BUNDLE_KIND);
    expect(bundle.versions).toHaveLength(1);
  });

  it('mergePublishedBundle 依 id 去重（既有保留）', () => {
    const { created } = addPublishedVersion(makeOrgData(), '本機');
    const incoming = {
      kind: PUBLISHED_BUNDLE_KIND,
      exportedAt: '',
      versions: [
        created, // 重複，應被略過
        { id: 'pub-new', label: '外來', publishedAt: '', data: makeOrgData() },
      ],
    };
    const merged = mergePublishedBundle(incoming);
    expect(merged).toHaveLength(2);
    expect(merged.some((v) => v.id === 'pub-new')).toBe(true);
  });

  it('非發布整包格式會丟錯', () => {
    expect(() => mergePublishedBundle({ foo: 1 })).toThrow();
    expect(() => mergePublishedBundle(null)).toThrow();
  });
});
