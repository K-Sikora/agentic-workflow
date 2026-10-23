import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

type Handler = (...args: unknown[]) => void;

function setup() {
  const handlers = new Map<string, Handler>();
  const server = {
    address: vi.fn().mockReturnValue({ port: 1234 }),
    close: vi.fn(),
    once: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
  };
  const listen = vi.fn((port: number, host: string, callback: () => void) => {
    queueMicrotask(callback);
    return server;
  });
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test/test');
  vi.mocked(createApp).mockReturnValue({ listen } as never);
  return { server, listen, database, handlers };
}

function captureSignals() {
  const signals = new Map<string, () => void>();
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    signals.set(event, handler);
    return process;
  }) as never);
  return signals;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe('start', () => {
  it('connects, initializes, listens on the default port and returns the server', async () => {
    vi.stubEnv('API_PORT', '');
    const { server, listen, database } = setup();
    captureSignals();
    const result = await start();
    expect(createDatabase).toHaveBeenCalledWith('postgresql://test/test');
    expect(database.$connect).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledWith(database);
    expect(createApp).toHaveBeenCalledWith(database);
    expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
    expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 1234');
    expect(result).toEqual({ server, database });
    expect(database.$disconnect).not.toHaveBeenCalled();
  });
  it('listens on API_PORT when set', async () => {
    vi.stubEnv('API_PORT', '9100');
    const { listen } = setup();
    captureSignals();
    await start();
    expect(listen).toHaveBeenCalledWith(9100, '0.0.0.0', expect.any(Function));
  });
  it('registers SIGTERM and SIGINT handlers', async () => {
    setup();
    const signals = captureSignals();
    await start();
    expect([...signals.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
  });
  it.each([
    ['connect', (database: ReturnType<typeof setup>['database']) => database.$connect.mockRejectedValue(new Error('connect failed')), 'connect failed'],
    ['initialize', () => vi.mocked(initialize).mockRejectedValue(new Error('init failed')), 'init failed'],
  ])('disconnects and rethrows when %s fails', async (_name, fail, message) => {
    const { database, listen } = setup();
    captureSignals();
    fail(database);
    await expect(start()).rejects.toThrow(message);
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(listen).not.toHaveBeenCalled();
  });
  it('disconnects and rethrows when the server fails to listen', async () => {
    const { database, listen, handlers } = setup();
    const signals = captureSignals();
    listen.mockImplementation((() => {
      queueMicrotask(() => handlers.get('error')!(new Error('EADDRINUSE')));
      return { once: (event: string, handler: Handler) => { handlers.set(event, handler); } };
    }) as never);
    await expect(start()).rejects.toThrow('EADDRINUSE');
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(signals.size).toBe(0);
  });
});

describe('shutdown', () => {
  async function started() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const context = setup();
    const signals = captureSignals();
    await start();
    return { ...context, signals };
  }

  it.each(['SIGTERM', 'SIGINT'])('closes the server and disconnects on %s', async (signal) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { server, database, signals } = await started();
    signals.get(signal)!();
    expect(server.close).toHaveBeenCalledOnce();
    expect(database.$disconnect).not.toHaveBeenCalled();
    await server.close.mock.calls[0][0]();
    expect(database.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
    vi.advanceTimersByTime(20000);
    expect(exit).not.toHaveBeenCalled();
  });
  it('forces exit with code 1 when the server does not close in time', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { server, signals } = await started();
    signals.get('SIGTERM')!();
    vi.advanceTimersByTime(9999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(server.close).toHaveBeenCalledOnce();
  });
  it('logs a disconnect failure and sets a failing exit code', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { server, database, signals } = await started();
    const failure = new Error('disconnect failed');
    database.$disconnect.mockRejectedValue(failure);
    signals.get('SIGTERM')!();
    await server.close.mock.calls[0][0]();
    expect(error).toHaveBeenCalledWith(failure);
    expect(process.exitCode).toBe(1);
    vi.advanceTimersByTime(20000);
    expect(exit).not.toHaveBeenCalled();
  });
});
