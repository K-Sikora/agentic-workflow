import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = {
    todo: { findFirst: vi.fn().mockResolvedValue({ id: 1 }), findMany: vi.fn().mockResolvedValue([record]) },
  };
  return { database, app: createApp(database as unknown as Database) };
}

it('reports health after querying the database', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(database.todo.findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
it('mounts the todos router on the real repository', async () => {
  const { app, database } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(database.todo.findMany).toHaveBeenCalledOnce();
});
it('does not expose the x-powered-by header', async () => {
  const { app } = setup();
  expect((await request(app).get('/api/health')).headers['x-powered-by']).toBeUndefined();
});
it('serves the OpenAPI specification and docs', async () => {
  const { app } = setup();
  const spec = await request(app).get('/openapi.json');
  expect(spec.status).toBe(200);
  expect(spec.body).toHaveProperty('openapi');
  expect((await request(app).get('/docs/')).status).toBe(200);
});
it('returns a JSON 404 for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/nope');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
it('returns 422 for invalid JSON', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{bad');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('returns 413 for oversized bodies', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
it('returns a generic 500 and logs unexpected errors', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { app, database } = setup();
  const failure = new Error('db down');
  database.todo.findFirst.mockRejectedValue(failure);
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(JSON.stringify(response.body)).not.toContain('db down');
  expect(error).toHaveBeenCalledWith(failure);
});
