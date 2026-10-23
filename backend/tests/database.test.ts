import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

it('creates a client without connecting', () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  expect(typeof database.$connect).toBe('function');
  expect(database.todo).toBeDefined();
});
it('initializes the todos table idempotently with raw SQL', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const execute = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await initialize(database);
  expect(execute).toHaveBeenCalledOnce();
  const sql = (execute.mock.calls[0][0] as unknown as TemplateStringsArray).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain("priority IN ('low', 'medium', 'high')");
});
it('propagates initialization errors', async () => {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  vi.spyOn(database, '$executeRaw').mockRejectedValue(new Error('boom'));
  await expect(initialize(database)).rejects.toThrow('boom');
});
