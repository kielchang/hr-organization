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
