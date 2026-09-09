import { Baldim, MemoryClient, StorageError, type Database } from '@baldim/core';
import { afterEach, describe, expect, test } from 'vitest';
import {
  GraphConfigurationError,
  GraphPlugin,
  InvalidEdgeError,
} from '../src/index.js';

let sequence = 0;
const databases: Database[] = [];

function database(label: string): Database {
  const db = new Baldim({
    connectionString: `memory://plugin-graph-extra-${label}-${++sequence}`,
    logLevel: 'silent',
  });
  databases.push(db);
  return db;
}

async function createGraphResources(db: Database): Promise<void> {
  await db.createResource({
    name: 'nodes',
    attributes: { name: 'string|required', kind: 'string|optional' },
  });
  await db.createResource({
    name: 'edges',
    asyncPartitions: false,
    attributes: {
      source: 'string|required',
      target: 'string|required',
      label: 'string|optional',
      weight: 'number|optional',
      snapshot: 'object|optional',
    },
    partitions: {
      bySource: { fields: { source: 'string' } },
      byTarget: { fields: { target: 'string' } },
      byLabel: { fields: { label: 'string' } },
    },
  });
}

afterEach(async () => {
  for (const db of databases.splice(0)) {
    if (db.isConnected()) await db.disconnect();
  }
  MemoryClient.clearAllStorage();
});

describe('@baldim/plugin-graph contracts', () => {
  test('removes resource namespaces and its database hook on stop', async () => {
    const db = database('stop');
    await db.connect();
    await createGraphResources(db);
    const graph = new GraphPlugin({
      vertices: ['nodes', 'later'],
      edges: 'edges',
      logLevel: 'silent',
    });
    await db.usePlugin(graph);
    expect(db.resources.nodes!.graph).toBeDefined();

    await graph.stop();
    expect(db.resources.nodes!.graph).toBeUndefined();
    const later = await db.createResource({
      name: 'later',
      attributes: { name: 'string|required' },
    });
    expect(later.graph).toBeUndefined();
  });

  test('honors includeEdges while returning neighboring vertices', async () => {
    const db = database('include-edges');
    await db.connect();
    await createGraphResources(db);
    await db.usePlugin(new GraphPlugin({
      vertices: 'nodes',
      edges: 'edges',
      logLevel: 'silent',
    }));
    await db.resources.nodes!.insert({ id: 'a', name: 'A' });
    await db.resources.nodes!.insert({ id: 'b', name: 'B' });
    await db.resources.nodes!.graph!.connect!('a', 'b', { label: 'knows' });

    expect((await db.resources.nodes!.graph!.neighbors!('a'))[0]!._edges).toEqual([]);
    expect((await db.resources.nodes!.graph!.neighbors!('a', { includeEdges: true }))[0]!._edges)
      .toHaveLength(1);
  });

  test('stores configured vertex snapshots on edges', async () => {
    const db = database('snapshots');
    await db.connect();
    await createGraphResources(db);
    await db.usePlugin(new GraphPlugin({
      vertices: 'nodes',
      edges: 'edges',
      denormalize: ['name', 'kind'],
      logLevel: 'silent',
    }));
    await db.resources.nodes!.insert({ id: 'a', name: 'Alice', kind: 'person' });
    await db.resources.nodes!.insert({ id: 'b', name: 'Bob', kind: 'person' });

    const edge = await db.resources.nodes!.graph!.connect!('a', 'b');
    expect(edge.snapshot).toEqual({ name: 'Bob', kind: 'person' });
    expect((await db.resources.nodes!.graph!.neighbors!('a'))[0]).toMatchObject({
      id: 'b',
      name: 'Bob',
      kind: 'person',
    });
  });

  test('rejects invalid weighted edges with canonical typed errors', async () => {
    const db = database('weights');
    await db.connect();
    await createGraphResources(db);
    await db.usePlugin(new GraphPlugin({
      vertices: 'nodes',
      edges: 'edges',
      weighted: true,
      logLevel: 'silent',
    }));

    const promise = db.resources.nodes!.graph!.connect!('a', 'b', { weight: -1 });
    await expect(promise).rejects.toBeInstanceOf(InvalidEdgeError);
    await expect(promise).rejects.toBeInstanceOf(StorageError);
    expect(() => new GraphPlugin({
      vertices: 'nodes',
      edges: 'edges',
      weighted: true,
      defaultWeight: -1,
    })).toThrow(GraphConfigurationError);
  });
});
