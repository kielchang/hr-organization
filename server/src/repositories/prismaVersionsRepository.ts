import { PrismaClient, type Prisma } from '@prisma/client';
import type {
  OrgVersionRecord,
  VersionsRepository,
} from './versionsRepository';

const DRAFT_ID = 'draft'; // 單租戶階段固定一筆草稿

/** 以 Prisma（PostgreSQL）實作版本／草稿持久化。 */
export function createPrismaVersionsRepository(prisma: PrismaClient): VersionsRepository {
  return {
    async listVersions() {
      const rows = await prisma.orgVersion.findMany({
        orderBy: { publishedAt: 'desc' },
      });
      return rows.map(toVersionRecord);
    },

    async getVersion(id) {
      const row = await prisma.orgVersion.findUnique({ where: { id } });
      return row ? toVersionRecord(row) : null;
    },

    async createVersion({ label, data }) {
      const row = await prisma.orgVersion.create({
        data: { label, data: data as Prisma.InputJsonValue },
      });
      return toVersionRecord(row);
    },

    async deleteVersion(id) {
      try {
        await prisma.orgVersion.delete({ where: { id } });
        return true;
      } catch {
        return false; // 不存在
      }
    },

    async getDraft() {
      const row = await prisma.orgDraft.findUnique({ where: { id: DRAFT_ID } });
      return row ? { data: row.data, updatedAt: row.updatedAt.toISOString() } : null;
    },

    async putDraft(data) {
      const row = await prisma.orgDraft.upsert({
        where: { id: DRAFT_ID },
        create: { id: DRAFT_ID, data: data as Prisma.InputJsonValue },
        update: { data: data as Prisma.InputJsonValue },
      });
      return { data: row.data, updatedAt: row.updatedAt.toISOString() };
    },
  };
}

function toVersionRecord(row: {
  id: string;
  label: string;
  data: unknown;
  publishedAt: Date;
}): OrgVersionRecord {
  return {
    id: row.id,
    label: row.label,
    data: row.data,
    publishedAt: row.publishedAt.toISOString(),
  };
}
