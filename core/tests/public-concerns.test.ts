import { describe, expect, it, vi } from 'vitest';
import { DistributedSequence, type SequenceData } from '../src/concerns/distributed-sequence.js';
import { HighPerformanceInserter, StreamInserter } from '../src/concerns/high-performance-inserter.js';
import { InMemoryPersistence, PartitionQueue } from '../src/concerns/partition-queue.js';

describe('public concern compatibility', () => {
  it('keeps distributed sequences provider-neutral', async () => {
    const values = new Map<string, SequenceData>();
    const storage = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: SequenceData, options: { ifNoneMatch?: string } = {}) => {
        if (options.ifNoneMatch === '*' && values.has(key)) {
          throw Object.assign(new Error('exists'), { code: 'PreconditionFailed' });
        }
        values.set(key, value);
        return { ETag: 'memory' };
      },
      delete: async (key: string) => { values.delete(key); }
    };
    const sequence = new DistributedSequence(storage);

    expect(await sequence.next('invoice')).toBe(1);
    expect(await sequence.next('invoice')).toBe(2);
    expect(await sequence.get('invoice')).toBe(3);
    expect(await sequence.reset('invoice', 40)).toBe(true);
    expect(await sequence.next('invoice')).toBe(40);
  });

  it('persists partition work and executes the matching resource operation', async () => {
    const persistence = new InMemoryPersistence();
    const createPartitionReferences = vi.fn(async () => undefined);
    const queue = new PartitionQueue({ persistence });

    await queue.enqueue({
      type: 'create',
      resource: {
        createPartitionReferences,
        handlePartitionReferenceUpdates: vi.fn(async () => undefined),
        deletePartitionReferences: vi.fn(async () => undefined)
      },
      data: { id: 'record-1' }
    });
    await new Promise(resolve => setImmediate(resolve));

    expect(createPartitionReferences).toHaveBeenCalledWith({ id: 'record-1' });
    expect(await persistence.getPending()).toEqual([]);
    queue.stop();
  });

  it('batches through Resource.insertMany without reaching into a provider', async () => {
    const insertMany = vi.fn(async (items: Record<string, unknown>[]) => items);
    const resource = {
      config: { asyncPartitions: false, partitions: {} },
      insert: vi.fn(async (data: Record<string, unknown>) => data),
      insertMany,
      createPartitionReferences: vi.fn(async () => undefined),
      emit: vi.fn(),
      generateId: () => 'id',
      getResourceKey: (id: string) => `resource=items/id=${id}`,
      schema: { mapper: async (data: Record<string, unknown>) => data },
      client: { putObject: vi.fn(async () => ({})) }
    };
    const inserter = new HighPerformanceInserter(resource, { batchSize: 2, flushInterval: 60_000 });

    await inserter.bulkAdd([{ id: 'a' }, { id: 'b' }]);
    await inserter.forceFlush();

    expect(insertMany).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }]);
    expect(inserter.getStats()).toMatchObject({ inserted: 2, failed: 0 });
    inserter.destroy();
  });

  it('uses the neutral putObject contract for direct stream inserts', async () => {
    const putObject = vi.fn(async () => ({}));
    const resource = {
      config: { asyncPartitions: false, partitions: {} },
      insert: async (data: Record<string, unknown>) => data,
      createPartitionReferences: async () => undefined,
      emit: () => undefined,
      generateId: () => 'generated',
      getResourceKey: (id: string) => `resource=items/id=${id}`,
      schema: { mapper: async (data: Record<string, unknown>) => data },
      client: { putObject }
    };

    expect(await new StreamInserter(resource).fastInsert({ title: 'hello' })).toEqual({
      id: 'generated',
      inserted: true
    });
    expect(putObject).toHaveBeenCalledWith({
      key: 'resource=items/id=generated',
      metadata: { id: 'generated', title: 'hello' },
      body: ''
    });
  });
});
