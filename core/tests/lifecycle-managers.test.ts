import { CronManager } from '../src/concerns/cron-manager.js';
import { ProcessManager } from '../src/concerns/process-manager.js';

describe('process lifecycle managers', () => {
  it('do not intercept application errors', () => {
    const before = {
      uncaught: process.listenerCount('uncaughtException'),
      rejection: process.listenerCount('unhandledRejection'),
      beforeExit: process.listenerCount('beforeExit'),
      sigint: process.listenerCount('SIGINT'),
      sigterm: process.listenerCount('SIGTERM'),
    };
    const processManager = new ProcessManager({ exitOnSignal: false, logLevel: 'silent' });
    const cronManager = new CronManager({ exitOnSignal: false, disabled: false, logLevel: 'silent' });

    expect(process.listenerCount('uncaughtException')).toBe(before.uncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rejection);
    expect(process.listenerCount('beforeExit')).toBe(before.beforeExit);
    expect(process.listenerCount('SIGINT')).toBe(before.sigint + 2);
    expect(process.listenerCount('SIGTERM')).toBe(before.sigterm + 2);

    processManager.removeSignalHandlers();
    cronManager.removeSignalHandlers();
    expect(process.listenerCount('SIGINT')).toBe(before.sigint);
    expect(process.listenerCount('SIGTERM')).toBe(before.sigterm);
  });

  it('can clear a precise interval from inside its callback', async () => {
    const manager = new ProcessManager({ exitOnSignal: false, logLevel: 'silent' });
    let runs = 0;
    manager.setInterval(() => {
      runs++;
      manager.clearInterval('self-clearing');
    }, 10, 'self-clearing');
    await new Promise(resolve => setTimeout(resolve, 45));
    expect(runs).toBe(1);
    expect(manager.getStatus().intervals).toEqual([]);
    manager.removeSignalHandlers();
  });

  it('updates the tracked timer so later interval cleanup works', async () => {
    const manager = new ProcessManager({ exitOnSignal: false, logLevel: 'silent' });
    let runs = 0;
    manager.setInterval(() => { runs++; }, 10, 'tracked');
    await new Promise(resolve => setTimeout(resolve, 28));
    manager.clearInterval('tracked');
    const stoppedAt = runs;
    await new Promise(resolve => setTimeout(resolve, 35));
    expect(runs).toBe(stoppedAt);
    manager.removeSignalHandlers();
  });

  it('removes fired timeouts from its registry even when callbacks throw', () => {
    vi.useFakeTimers();
    const manager = new ProcessManager({ exitOnSignal: false, logLevel: 'silent' });
    const error = new Error('callback failed');
    manager.setTimeout(() => { throw error; }, 10, 'throws');
    expect(() => vi.advanceTimersByTime(10)).toThrow(error);
    expect(manager.getStatus().timeouts).toEqual([]);
    manager.removeSignalHandlers();
    vi.useRealTimers();
  });

  it('clears shutdown timeout handles after fast cleanup', async () => {
    vi.useFakeTimers();
    const manager = new ProcessManager({ exitOnSignal: false, shutdownTimeout: 30_000, logLevel: 'silent' });
    manager.registerCleanup(async () => undefined, 'fast');
    await manager.shutdown();
    expect(vi.getTimerCount()).toBe(0);
    manager.removeSignalHandlers();
    vi.useRealTimers();
  });
});
