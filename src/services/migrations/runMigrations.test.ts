import { detectSchemaVersion, runMigrations, type Migration } from './runMigrations';

describe('detectSchemaVersion', () => {
  it('讀出物件的 schemaVersion', () => {
    expect(detectSchemaVersion({ schemaVersion: 3 })).toBe(3);
  });

  it('無 schemaVersion 欄位視為第 0 版', () => {
    expect(detectSchemaVersion({})).toBe(0);
    expect(detectSchemaVersion(null)).toBe(0);
    expect(detectSchemaVersion('x')).toBe(0);
  });
});

describe('runMigrations', () => {
  const migrations: Migration[] = [
    { to: 1, migrate: (r) => ({ ...(r as object), schemaVersion: 1, a: 1 }) },
    { to: 2, migrate: (r) => ({ ...(r as object), schemaVersion: 2, b: 2 }) },
    { to: 3, migrate: (r) => ({ ...(r as object), schemaVersion: 3, c: 3 }) },
  ];

  it('從第 0 版跑完整鏈到目標版', () => {
    const out = runMigrations<Record<string, number>>({}, 3, migrations);
    expect(out).toMatchObject({ schemaVersion: 3, a: 1, b: 2, c: 3 });
  });

  it('只套用高於現有版本的步驟（跳版）', () => {
    const out = runMigrations<Record<string, unknown>>(
      { schemaVersion: 2 },
      3,
      migrations,
    );
    expect(out).toMatchObject({ schemaVersion: 3, c: 3 });
    expect(out.a).toBeUndefined();
    expect(out.b).toBeUndefined();
  });

  it('已是最新版時不變動（冪等）', () => {
    const input = { schemaVersion: 3, c: 3 };
    const out = runMigrations<Record<string, unknown>>(input, 3, migrations);
    expect(out).toMatchObject({ schemaVersion: 3 });
  });

  it('未照順序提供步驟也會依 to 升冪套用', () => {
    const shuffled = [migrations[2], migrations[0], migrations[1]];
    const out = runMigrations<Record<string, number>>({}, 3, shuffled);
    expect(out).toMatchObject({ a: 1, b: 2, c: 3 });
  });

  it('資料版本高於程式支援版本時拋錯', () => {
    expect(() => runMigrations({ schemaVersion: 99 }, 3, migrations)).toThrow(
      /高於程式支援版本/,
    );
  });
});
