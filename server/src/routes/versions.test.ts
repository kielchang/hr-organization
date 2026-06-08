import { describe, expect, it } from 'vitest';
import { buildApp } from '../app';

const sampleData = { employees: [{ id: 'e1' }], groups: [] };

describe('版本 API', () => {
  it('初始無版本回空陣列', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/versions' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('發布版本 → 列出 / 取得 / 刪除', async () => {
    const app = buildApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/versions',
      payload: { label: 'v1', data: sampleData },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(id).toBeTruthy();

    const list = await app.inject({ method: 'GET', url: '/api/versions' });
    expect(list.json()).toHaveLength(1);

    const got = await app.inject({ method: 'GET', url: `/api/versions/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().data).toEqual(sampleData);

    const del = await app.inject({ method: 'DELETE', url: `/api/versions/${id}` });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/versions' });
    expect(after.json()).toEqual([]);
    await app.close();
  });

  it('label 缺失回 400', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/versions', payload: { data: {} } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('取得不存在的版本回 404', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/versions/nope' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('草稿 API', () => {
  it('尚無草稿回 404，PUT 後可取回', async () => {
    const app = buildApp();

    const empty = await app.inject({ method: 'GET', url: '/api/draft' });
    expect(empty.statusCode).toBe(404);

    const put = await app.inject({ method: 'PUT', url: '/api/draft', payload: { data: sampleData } });
    expect(put.statusCode).toBe(200);

    const got = await app.inject({ method: 'GET', url: '/api/draft' });
    expect(got.statusCode).toBe(200);
    expect(got.json().data).toEqual(sampleData);
    await app.close();
  });
});
