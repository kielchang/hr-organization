/**
 * 通用 schema migration 框架。
 *
 * 設計重點：
 * - 「schema 版本」描述資料**結構**，與使用者面的「內容版本」（OrgData.contentVersion、
 *   BpmnProcess.version）是兩個不同概念，請勿混用。
 * - migration 線性遞增：每個 step 只負責 (to-1) → to，框架負責依序套用。
 * - 缺 `schemaVersion` 欄位的舊資料一律視為第 0 版，從頭跑完整鏈。
 * - 資料版本高於程式支援版本時拋錯，避免新版資料被舊程式靜默損壞。
 */

/** 單一 schema 升級步驟：把 (to-1) 版資料升級為 to 版。 */
export interface Migration {
  /** 升級後的目標 schemaVersion。 */
  to: number;
  /** 從上一版資料轉成本版資料（純函式，不可變）。 */
  migrate: (raw: unknown) => unknown;
}

/** 讀出資料的 schemaVersion；無此欄位的舊資料視為第 0 版。 */
export function detectSchemaVersion(raw: unknown): number {
  if (raw && typeof raw === 'object') {
    const v = (raw as Record<string, unknown>).schemaVersion;
    if (typeof v === 'number') return v;
  }
  return 0;
}

/**
 * 依序套用 migration，把資料升級到 `current` 版。
 *
 * @param raw         待升級的原始資料
 * @param current     程式碼當前支援的最新 schemaVersion
 * @param migrations  各版升級步驟（會依 `to` 升冪排序後套用）
 * @throws 當資料版本高於 `current`（資料比程式新）時
 */
export function runMigrations<T>(
  raw: unknown,
  current: number,
  migrations: Migration[],
): T {
  const from = detectSchemaVersion(raw);
  if (from > current) {
    throw new Error(
      `資料 schemaVersion (${from}) 高於程式支援版本 (${current})，請更新應用程式後再試`,
    );
  }

  let data: unknown = raw;
  let version = from;
  for (const step of [...migrations].sort((a, b) => a.to - b.to)) {
    if (step.to > version) {
      data = step.migrate(data);
      version = step.to;
    }
  }
  return data as T;
}
