/**
 * 版本「生效日」邏輯。
 *
 * - 版本可帶 `effectiveDate`（YYYY-MM-DD）。未設＝發布即生效（以 publishedAt 為準）。
 * - 某時間點「目前生效的版本」＝在所有「生效時刻 ≤ 該時間點」的版本中，生效時刻最新者。
 */

export type EffectiveStatus = 'effective' | 'scheduled';

export interface EffectiveDatedVersion {
  id: string;
  publishedAt: string;
  /** YYYY-MM-DD；未設表示發布即生效。 */
  effectiveDate?: string;
}

/** 版本的「生效時刻」：有 effectiveDate 用當日 00:00，否則用 publishedAt。 */
export function effectiveInstant(version: EffectiveDatedVersion): number {
  if (version.effectiveDate) {
    const t = new Date(`${version.effectiveDate}T00:00:00`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return new Date(version.publishedAt).getTime();
}

/** 相對於 asOf，版本是「已生效」還是「排程中（未生效）」。 */
export function effectiveStatus(
  version: EffectiveDatedVersion,
  asOf: Date = new Date(),
): EffectiveStatus {
  return effectiveInstant(version) <= asOf.getTime() ? 'effective' : 'scheduled';
}

/**
 * 在 asOf 時間點「目前生效」的版本 id：
 * 取所有已生效版本中，生效時刻最新者；皆未生效則回 null。
 */
export function pickEffectiveVersionId(
  versions: EffectiveDatedVersion[],
  asOf: Date = new Date(),
): string | null {
  const now = asOf.getTime();
  let best: { id: string; instant: number } | null = null;
  for (const v of versions) {
    const instant = effectiveInstant(v);
    if (instant <= now && (!best || instant > best.instant)) {
      best = { id: v.id, instant };
    }
  }
  return best?.id ?? null;
}
