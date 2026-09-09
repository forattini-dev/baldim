import { EventualConsistencyPlugin } from '../src/index.js';
import { createDatabaseForTest } from './helpers.js';

describe('EventualConsistencyPlugin lifecycle', () => {
  it('restores resource methods and removes plugin metadata on stop', async () => {
    const database = createDatabaseForTest('suite=plugins/ec-lifecycle');
    await database.connect();

    const resource = await database.createResource({
      name: 'counters',
      attributes: {
        id: 'string|optional',
        value: 'number|default:0'
      }
    });
    const originalAdd = async () => 'original-add';
    resource.add = originalAdd;

    const plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      enableCoordinator: false,
      resources: { counters: ['value'] },
      consolidation: { mode: 'async', auto: false }
    });

    await database.usePlugin(plugin, 'eventual-lifecycle');
    await expect(plugin.start()).resolves.toBeUndefined();

    expect(resource.add).not.toBe(originalAdd);
    expect(typeof resource.sub).toBe('function');
    expect(resource._eventualConsistencyPlugins.value).toBeDefined();

    await plugin.stop();

    expect(resource.add).toBe(originalAdd);
    expect(resource.sub).toBeUndefined();
    expect(resource.consolidate).toBeUndefined();
    expect(resource.recalculate).toBeUndefined();
    expect(resource._eventualConsistencyPlugins).toBeUndefined();

    await database.disconnect();
  });
});
