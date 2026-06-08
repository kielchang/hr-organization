/** 組織資料的「版本／草稿」持久化抽象。P2 先提供記憶體實作（測試與開發後備）； */
/** P2b 再加入 Prisma（PostgreSQL）實作，兩者共用此介面。 */

export interface OrgVersionRecord {
  id: string;
  label: string;
  data: unknown;
  publishedAt: string;
}

export interface OrgDraftRecord {
  data: unknown;
  updatedAt: string;
}

export interface VersionsRepository {
  listVersions(): Promise<OrgVersionRecord[]>;
  getVersion(id: string): Promise<OrgVersionRecord | null>;
  createVersion(input: { label: string; data: unknown }): Promise<OrgVersionRecord>;
  deleteVersion(id: string): Promise<boolean>;
  getDraft(): Promise<OrgDraftRecord | null>;
  putDraft(data: unknown): Promise<OrgDraftRecord>;
}

function newId(): string {
  return 'ver-' + Math.random().toString(36).slice(2, 10);
}

/** 記憶體實作：適合單元測試與無資料庫時的開發後備。 */
export function createInMemoryVersionsRepository(): VersionsRepository {
  const versions = new Map<string, OrgVersionRecord>();
  let draft: OrgDraftRecord | null = null;

  return {
    async listVersions() {
      // 最新發布在前
      return [...versions.values()].sort((a, b) =>
        b.publishedAt.localeCompare(a.publishedAt),
      );
    },
    async getVersion(id) {
      return versions.get(id) ?? null;
    },
    async createVersion({ label, data }) {
      const record: OrgVersionRecord = {
        id: newId(),
        label,
        data,
        publishedAt: new Date().toISOString(),
      };
      versions.set(record.id, record);
      return record;
    },
    async deleteVersion(id) {
      return versions.delete(id);
    },
    async getDraft() {
      return draft;
    },
    async putDraft(data) {
      draft = { data, updatedAt: new Date().toISOString() };
      return draft;
    },
  };
}
