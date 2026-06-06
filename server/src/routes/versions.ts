import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VersionsRepository } from '../repositories/versionsRepository';

const createVersionBody = z.object({
  label: z.string().min(1, 'label 不可為空'),
  data: z.unknown(),
});

const draftBody = z.object({
  data: z.unknown(),
});

/** 註冊版本／草稿持久化路由，資料存取透過注入的 repository。 */
export function registerVersionRoutes(app: FastifyInstance, repo: VersionsRepository) {
  app.get('/api/versions', async () => {
    return repo.listVersions();
  });

  app.post('/api/versions', async (req, reply) => {
    const parsed = createVersionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '格式錯誤' });
    }
    const created = await repo.createVersion({
      label: parsed.data.label,
      data: parsed.data.data ?? null,
    });
    return reply.code(201).send(created);
  });

  app.get('/api/versions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = await repo.getVersion(id);
    if (!found) return reply.code(404).send({ error: '找不到版本' });
    return found;
  });

  app.delete('/api/versions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await repo.deleteVersion(id);
    if (!ok) return reply.code(404).send({ error: '找不到版本' });
    return reply.code(204).send();
  });

  app.get('/api/draft', async (_req, reply) => {
    const draft = await repo.getDraft();
    if (!draft) return reply.code(404).send({ error: '尚無草稿' });
    return draft;
  });

  app.put('/api/draft', async (req, reply) => {
    const parsed = draftBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '格式錯誤' });
    }
    return repo.putDraft(parsed.data.data);
  });
}
