import { buildApp } from './app';
import {
  createInMemoryVersionsRepository,
  type VersionsRepository,
} from './repositories/versionsRepository';

async function resolveRepo(): Promise<VersionsRepository> {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    const { createPrismaVersionsRepository } = await import(
      './repositories/prismaVersionsRepository'
    );
    console.log('持久層：Prisma（PostgreSQL）');
    return createPrismaVersionsRepository(new PrismaClient());
  }
  console.log('持久層：記憶體（未設 DATABASE_URL）');
  return createInMemoryVersionsRepository();
}

async function main() {
  const versionsRepo = await resolveRepo();
  const app = buildApp({ versionsRepo });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API listening on :${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
