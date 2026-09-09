import { Baldim, MemoryClient, type Database } from '@baldim/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SchedulerPlugin, type JobConfig } from '../src/index.js';

let sequence = 0;

function createDatabase(label: string): Database {
  return new Baldim({
    connectionString: `memory://plugin-scheduler-${label}-${++sequence}`,
    logLevel: 'silent',
  });
}

function createPlugin(jobs: Record<string, JobConfig>, options: Record<string, unknown> = {}): SchedulerPlugin {
  return new SchedulerPlugin({
    enableCoordinator: false,
    logLevel: 'silent',
    jobs,
    ...options,
  });
}

beforeEach(() => {
  MemoryClient.clearAllStorage();
});

describe('@baldim/plugin-scheduler', () => {
  test('validates required jobs, actions, and cron expressions', () => {
    expect(() => new SchedulerPlugin({ jobs: {} })).toThrow('At least one job must be defined');
    expect(() => new SchedulerPlugin({
      jobs: { broken: { action: async () => undefined } as JobConfig },
    })).toThrow("Job 'broken' must have a schedule");
    expect(() => new SchedulerPlugin({
      jobs: { broken: { schedule: '@daily' } as JobConfig },
    })).toThrow("Job 'broken' must have an action function");
    expect(() => createPlugin({
      broken: { schedule: 'not cron', action: async () => undefined },
    })).toThrow("Job 'broken' has invalid cron expression");
  });

  test('calculates future runs for shortcuts, ranges, names, and timezones', () => {
    const plugin = createPlugin({
      daily: { schedule: '@daily', action: async () => undefined },
    });
    const scheduler = plugin as any;

    expect(scheduler._isValidCronExpression('@hourly')).toBe(true);
    expect(scheduler._isValidCronExpression('*/15 9-17 * JAN MON-FRI')).toBe(true);
    expect(scheduler._isValidCronExpression('61 * * * *')).toBe(false);
    expect(plugin._calculateNextRunFromConfig({ enabled: false, schedule: '@daily' })).toBeNull();

    const next = plugin._calculateNextRunFromConfig({
      enabled: true,
      schedule: '0 9 * * MON-FRI',
      timezone: 'America/Sao_Paulo',
    });
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  test('installs jobs and the persistent history resource', async () => {
    const db = createDatabase('install');
    await db.connect();
    const plugin = createPlugin({
      cleanup: { schedule: '@hourly', enabled: false, action: async () => ({ ok: true }) },
    });

    await db.usePlugin(plugin);

    expect(plugin.jobs.has('cleanup')).toBe(true);
    expect(plugin.statistics.get('cleanup')).toMatchObject({ totalRuns: 0, totalSuccesses: 0, totalErrors: 0 });
    expect(db.resources.plg_job_executions?.behavior).toBe('body-only');
    await db.disconnect();
  });

  test('runs a job, calls lifecycle hooks, and persists history', async () => {
    const db = createDatabase('success');
    await db.connect();
    const action = vi.fn(async (_db, context) => ({ executionId: context.executionId }));
    const onJobStart = vi.fn();
    const onJobComplete = vi.fn();
    const plugin = createPlugin({
      report: { schedule: '@hourly', enabled: false, action },
    }, { onJobStart, onJobComplete });
    await db.usePlugin(plugin);

    await plugin.runJob('report');

    expect(action).toHaveBeenCalledOnce();
    expect(onJobStart).toHaveBeenCalledOnce();
    expect(onJobComplete).toHaveBeenCalledOnce();
    expect(plugin.getJobStatus('report')?.statistics).toMatchObject({ totalRuns: 1, totalSuccesses: 1, totalErrors: 0 });
    const history = await plugin.getJobHistory('report');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: 'success', retryCount: 0 });
    await db.disconnect();
  });

  test('retries failures and records the final success', async () => {
    const db = createDatabase('retry');
    await db.connect();
    let attempts = 0;
    const plugin = createPlugin({
      flaky: {
        schedule: '@hourly',
        enabled: false,
        retries: 2,
        action: async () => {
          attempts++;
          if (attempts < 3) throw new Error('temporary');
          return 'ok';
        },
      },
    });
    await db.usePlugin(plugin);

    await plugin.runJob('flaky');

    expect(attempts).toBe(3);
    expect(plugin.getJobStatus('flaky')?.statistics.totalSuccesses).toBe(1);
    expect((await plugin.getJobHistory('flaky'))[0]?.retryCount).toBe(2);
    await db.disconnect();
  });

  test('reports a terminal failure and releases its distributed lock', async () => {
    const db = createDatabase('failure');
    await db.connect();
    const onJobError = vi.fn();
    const plugin = createPlugin({
      failing: {
        schedule: '@hourly',
        enabled: false,
        retries: 1,
        action: async () => { throw new Error('permanent'); },
      },
    }, { onJobError });
    await db.usePlugin(plugin);

    await expect(plugin.runJob('failing')).rejects.toThrow('permanent');
    await expect(plugin.runJob('failing')).rejects.toThrow('permanent');

    expect(onJobError).toHaveBeenCalledTimes(2);
    expect(plugin.getJobStatus('failing')?.statistics).toMatchObject({ totalRuns: 2, totalErrors: 2 });
    await db.disconnect();
  });

  test('rejects concurrent manual execution in the same instance', async () => {
    const db = createDatabase('concurrent');
    await db.connect();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const plugin = createPlugin({
      slow: { schedule: '@hourly', enabled: false, action: async () => blocked },
    }, { defaultTimeout: 1_000 });
    await db.usePlugin(plugin);

    const first = plugin.runJob('slow');
    await vi.waitFor(() => expect(plugin.activeJobs.has('slow')).toBe(true));
    await expect(plugin.runJob('slow')).rejects.toThrow('already running');
    release();
    await first;

    expect(plugin.activeJobs.has('slow')).toBe(false);
    await db.disconnect();
  });

  test('adds, enables, disables, and removes jobs', async () => {
    const db = createDatabase('management');
    await db.connect();
    const plugin = createPlugin({
      original: { schedule: '@hourly', enabled: false, action: async () => undefined },
    }, { persistJobs: false });
    await db.usePlugin(plugin);

    plugin.addJob('dynamic', { schedule: '@daily', enabled: false, action: async () => undefined });
    expect(plugin.getAllJobsStatus().map((job) => job.name).sort()).toEqual(['dynamic', 'original']);

    plugin.enableJob('dynamic');
    expect(plugin.getJobStatus('dynamic')?.enabled).toBe(true);
    plugin.disableJob('dynamic');
    expect(plugin.getJobStatus('dynamic')?.enabled).toBe(false);
    plugin.removeJob('dynamic');
    expect(plugin.getJobStatus('dynamic')).toBeNull();
    await db.disconnect();
  });
});
