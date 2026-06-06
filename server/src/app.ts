import Fastify, { type FastifyInstance } from 'fastify';
import {
  createInMemoryVersionsRepository,
  type VersionsRepository,
} from './repositories/versionsRepository';
import { registerVersionRoutes } from './routes/versions';

export interface BuildAppOptions {
  /** 版本／草稿持久化實作；預設記憶體（之後可注入 Prisma 實作）。 */
  versionsRepo?: VersionsRepository;
}

/** 建立並設定 Fastify app（不啟動監聽，方便測試以 inject 呼叫）。 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const versionsRepo = options.versionsRepo ?? createInMemoryVersionsRepository();

  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  registerVersionRoutes(app, versionsRepo);

  return app;
}
