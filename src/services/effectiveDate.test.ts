import {
  effectiveInstant,
  effectiveStatus,
  pickEffectiveVersionId,
  type EffectiveDatedVersion,
} from './effectiveDate';

const asOf = new Date('2026-06-06T12:00:00');

describe('effectiveStatus', () => {
  it('無 effectiveDate → 以 publishedAt 判斷（過去＝已生效）', () => {
    expect(effectiveStatus({ id: 'a', publishedAt: '2026-01-01T00:00:00Z' }, asOf)).toBe('effective');
  });

  it('未來 effectiveDate → 排程中', () => {
    expect(
      effectiveStatus({ id: 'a', publishedAt: '2026-01-01T00:00:00Z', effectiveDate: '2026-12-31' }, asOf),
    ).toBe('scheduled');
  });

  it('今天或過去的 effectiveDate → 已生效', () => {
    expect(
      effectiveStatus({ id: 'a', publishedAt: '2026-01-01T00:00:00Z', effectiveDate: '2026-06-06' }, asOf),
    ).toBe('effective');
    expect(
      effectiveStatus({ id: 'a', publishedAt: '2026-01-01T00:00:00Z', effectiveDate: '2026-05-01' }, asOf),
    ).toBe('effective');
  });
});

describe('effectiveInstant', () => {
  it('effectiveDate 無效時退回 publishedAt', () => {
    const v = { id: 'a', publishedAt: '2026-02-02T00:00:00Z', effectiveDate: 'not-a-date' };
    expect(effectiveInstant(v)).toBe(new Date('2026-02-02T00:00:00Z').getTime());
  });
});

describe('pickEffectiveVersionId', () => {
  const versions: EffectiveDatedVersion[] = [
    { id: 'old', publishedAt: '2026-01-01T00:00:00Z' }, // 已生效（舊）
    { id: 'mid', publishedAt: '2026-03-01T00:00:00Z', effectiveDate: '2026-05-01' }, // 已生效（較新）
    { id: 'future', publishedAt: '2026-04-01T00:00:00Z', effectiveDate: '2026-12-31' }, // 排程未生效
  ];

  it('取已生效中生效時刻最新者', () => {
    expect(pickEffectiveVersionId(versions, asOf)).toBe('mid');
  });

  it('排在更未來的時間點會納入原本排程的版本', () => {
    expect(pickEffectiveVersionId(versions, new Date('2027-01-01T00:00:00'))).toBe('future');
  });

  it('全部尚未生效時回 null', () => {
    expect(
      pickEffectiveVersionId([{ id: 'x', publishedAt: '2030-01-01T00:00:00Z', effectiveDate: '2030-01-01' }], asOf),
    ).toBeNull();
  });

  it('空清單回 null', () => {
    expect(pickEffectiveVersionId([], asOf)).toBeNull();
  });
});
