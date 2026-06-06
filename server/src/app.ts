import Fastify, { type FastifyInstance } from 'fastify';

/** 建立並設定 Fastify app（不啟動監聽，方便測試以 inject 呼叫）。 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  return app;
}
