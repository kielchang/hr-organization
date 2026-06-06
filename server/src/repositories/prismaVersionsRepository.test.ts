import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createPrismaVersionsRepository,
} from './prismaVersionsRepository';
import type { VersionsRepository } from './versionsRepository';

// 僅在提供 TEST_DATABASE_URL 時執行（CI 與本地有 Postgres 時）；否則跳過以保持 hermetic。
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PrismaVersionsRepository（整合，需 Postgres）', () => {
  // 延後建立 client：skipIf 為 true 時 describe 回呼仍會執行以收集測試，
  // 故不可在此處頂層 new PrismaClient（url 為空會丟錯）。改於 beforeAll 建立。
  let prisma: PrismaClient;
  let repo: VersionsRepository;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = createPrismaVersionsRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.orgVersion.deleteMany();
    await prisma.orgDraft.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.orgVersion.deleteMany();
    await prisma.orgDraft.deleteMany();
  });

  it('createVersion / listVersions / getVersion / deleteVersion', async () => {
    const created = await repo.createVersion({ label: 'v1', data: { employees: [{ id: 'e1' }] } });
    expect(created.id).toBeTruthy();

    const list = await repo.listVersions();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('v1');

    const got = await repo.getVersion(created.id);
    expect(got?.data).toEqual({ employees: [{ id: 'e1' }] });

    expect(await repo.deleteVersion(created.id)).toBe(true);
    expect(await repo.deleteVersion(created.id)).toBe(false); // 已不存在
    expect(await repo.listVersions()).toEqual([]);
  });

  it('listVersions 依 publishedAt 由新到舊', async () => {
    await repo.createVersion({ label: 'a', data: {} });
    await new Promise((r) => setTimeout(r, 5));
    await repo.createVersion({ label: 'b', data: {} });
    const list = await repo.listVersions();
    expect(list.map((v) => v.label)).toEqual(['b', 'a']);
  });

  it('getVersion 不存在回 null', async () => {
    expect(await repo.getVersion('nope')).toBeNull();
  });

  it('draft：初始 null、putDraft 後可取回、再 put 覆寫', async () => {
    expect(await repo.getDraft()).toBeNull();

    const first = await repo.putDraft({ a: 1 });
    expect(first.data).toEqual({ a: 1 });

    const got = await repo.getDraft();
    expect(got?.data).toEqual({ a: 1 });

    await repo.putDraft({ a: 2 });
    expect((await repo.getDraft())?.data).toEqual({ a: 2 });
  });
});
