import { afterEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

afterEach(() => vi.unstubAllEnvs());

const componentEnv = { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'pass', POSTGRES_HOST: 'db', DB_PORT: '5433', POSTGRES_DB: 'taskly' };
function stubComponents(overrides: Record<string, string> = {}) {
  vi.stubEnv('DATABASE_URL', '');
  for (const [name, value] of Object.entries({ ...componentEnv, ...overrides })) vi.stubEnv(name, value);
}

it('prefers an explicit override over the environment', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});
it('uses DATABASE_URL from the environment', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl()).toBe('postgresql://env/db');
});
it('rewrites the SQLAlchemy psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@h:5432/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
});
it('builds the URL from components', () => {
  stubComponents();
  expect(resolveDatabaseUrl()).toBe('postgresql://user:pass@db:5433/taskly');
});
it('encodes special characters in components', () => {
  stubComponents({ POSTGRES_PASSWORD: 'p@ss/w:rd', POSTGRES_DB: 'my db' });
  const url = new URL(resolveDatabaseUrl());
  expect(decodeURIComponent(url.password)).toBe('p@ss/w:rd');
  expect(url.hostname).toBe('db');
  expect(url.pathname).toBe('/my%20db');
});
it.each(Object.keys(componentEnv))('throws when %s is missing', (name) => {
  stubComponents({ [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
