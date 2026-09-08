import { Baldin, MemoryClient, type Database, type Resource } from '@baldin/core';
import { afterEach, describe, expect, test } from 'vitest';
import { GeoError, GeoPlugin } from '../src/index.js';

let sequence = 0;
const databases: Database[] = [];

function createDatabase(label: string): Database {
  const database = new Baldin({
    connectionString: `memory://plugin-geo-${label}-${++sequence}`,
    logLevel: 'silent',
  });
  databases.push(database);
  return database;
}

async function createStores(database: Database, optional = false): Promise<Resource> {
  return database.createResource({
    name: 'stores',
    attributes: {
      name: 'string|required',
      latitude: optional ? { type: 'number', optional: true } : 'number|required',
      longitude: optional ? { type: 'number', optional: true } : 'number|required',
    },
    asyncPartitions: false,
  });
}

function plugin(overrides: Record<string, unknown> = {}): GeoPlugin {
  return new GeoPlugin({
    logLevel: 'silent',
    resources: {
      stores: {
        latField: 'latitude',
        lonField: 'longitude',
        precision: 5,
        addGeohash: true,
        ...overrides,
      },
    },
  });
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    if (database.isConnected()) await database.disconnect();
  }
  MemoryClient.clearAllStorage();
});

describe('@baldin/plugin-geo', () => {
  test('encodes, decodes, and validates geohashes', () => {
    const geo = plugin();
    const hash = geo.encodeGeohash(-23.5505, -46.6333, 5);
    const decoded = geo.decodeGeohash(hash);

    expect(hash).toBe('6gyf4');
    expect(decoded.latitude).toBeCloseTo(-23.5505, 1);
    expect(decoded.longitude).toBeCloseTo(-46.6333, 1);
    expect(() => geo.decodeGeohash('abc')).toThrow('Invalid geohash character');
    expect(() => geo.encodeGeohash(91, 0)).toThrow('latitude must be between -90 and 90');
    expect(() => geo.encodeGeohash(0, 0, 13)).toThrow('precision must be an integer');
  });

  test('calculates distance, neighbors, zoom, and bounded hashes', () => {
    const geo = plugin();
    const distance = geo.calculateDistance(-23.5505, -46.6333, -22.9068, -43.1729);
    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(370);
    expect(new Set(geo.getNeighbors('6gyf4')).size).toBe(8);
    expect(geo.selectOptimalZoom([4, 5, 6, 7], 5)).toBe(6);

    const hashes = geo.getGeohashesInBounds({
      north: -23.5,
      south: -23.6,
      east: -46.6,
      west: -46.7,
      precision: 5,
    });
    expect(hashes).toContain(geo.encodeGeohash(-23.5, -46.7, 5));
    expect(() => geo.getGeohashesInBounds({
      north: 90,
      south: -90,
      east: 180,
      west: -180,
      precision: 12,
    })).toThrow('more than 10000 geohash cells');
  });

  test('adds schema fields and recalculates geohashes on insert and update', async () => {
    const database = createDatabase('writes');
    await database.connect();
    const stores = await createStores(database);
    await database.usePlugin(plugin({ zoomLevels: [4, 5, 6] }));

    expect(stores.attributes.geohash).toBeDefined();
    expect(stores.attributes._geohash_zoom6).toBeDefined();
    const created = await stores.insert({
      id: 'central',
      name: 'Central',
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(created.geohash).toBe('6gyf4');
    expect(created._geohash_zoom4).toBe('6gyf');
    expect(created._geohash_zoom6).toBe('6gyf4b');

    const updated = await stores.update('central', {
      latitude: -23.6,
      longitude: -46.7,
    });
    expect(updated.geohash).not.toBe(created.geohash);
  });

  test('supports records with optional coordinates', async () => {
    const database = createDatabase('optional');
    await database.connect();
    const stores = await createStores(database, true);
    await database.usePlugin(plugin());

    expect(stores.attributes._geohash).toBe('string|optional');
    const record = await stores.insert({ id: 'unknown', name: 'Unknown' });
    expect(record._geohash).toBeUndefined();
    expect(await stores.findNearby!({ lat: -23.55, lon: -46.63 })).toEqual([]);
  });

  test('finds nearby records in distance order and respects radius and limit', async () => {
    const database = createDatabase('nearby');
    await database.connect();
    const stores = await createStores(database);
    await database.usePlugin(plugin());
    await stores.insert({ id: 'one', name: 'One', latitude: -23.5505, longitude: -46.6333 });
    await stores.insert({ id: 'two', name: 'Two', latitude: -23.5555, longitude: -46.6383 });
    await stores.insert({ id: 'far', name: 'Far', latitude: -22.9068, longitude: -43.1729 });

    const nearby = await stores.findNearby!({
      lat: -23.5505,
      lon: -46.6333,
      radius: 10,
      limit: 1,
    });
    expect(nearby.map((record) => record.id)).toEqual(['one']);
    expect(nearby[0]!._distance).toBeCloseTo(0);
    await expect(stores.findNearby!({ lat: -23.55, lon: -46.63, radius: -1 }))
      .rejects.toThrow('radius must be greater than or equal to zero');
  });

  test('finds records in ordinary and date-line crossing bounds', async () => {
    const database = createDatabase('bounds');
    await database.connect();
    const stores = await createStores(database);
    await database.usePlugin(plugin());
    await stores.insert({ id: 'east', name: 'East', latitude: 0, longitude: 179.8 });
    await stores.insert({ id: 'west', name: 'West', latitude: 0, longitude: -179.8 });
    await stores.insert({ id: 'middle', name: 'Middle', latitude: 0, longitude: 0 });

    expect((await stores.findInBounds!({
      north: 1,
      south: -1,
      west: 179,
      east: -179,
    })).map((record) => record.id).sort()).toEqual(['east', 'west']);
    await expect(stores.findInBounds!({ north: -1, south: 1, east: 1, west: -1 }))
      .rejects.toThrow('north must be greater than or equal to south');
  });

  test('creates zoom partitions and uses them for spatial queries', async () => {
    const database = createDatabase('partitions');
    await database.connect();
    const stores = await createStores(database);
    const geo = plugin({ usePartitions: true, zoomLevels: [4, 5, 6] });
    await database.usePlugin(geo);

    expect(stores.config.partitions?.byGeohashZoom4?.fields).toEqual({ _geohash_zoom4: 'string' });
    await stores.insert({ id: 'one', name: 'One', latitude: -23.5505, longitude: -46.6333 });
    await stores.insert({ id: 'far', name: 'Far', latitude: -22.9068, longitude: -43.1729 });
    expect((await stores.findNearby!({
      lat: -23.5505,
      lon: -46.6333,
      radius: 5,
    })).map((record) => record.id)).toEqual(['one']);

    const partitionCount = Object.keys(stores.config.partitions || {}).length;
    expect(geo.setupPartitions(stores as never, geo.resources.stores!)).toBe(false);
    expect(Object.keys(stores.config.partitions || {})).toHaveLength(partitionCount);
  });

  test('configures resources created after installation', async () => {
    const database = createDatabase('future');
    await database.connect();
    await database.usePlugin(plugin());
    const stores = await createStores(database);

    expect(stores.findNearby).toBeTypeOf('function');
    expect((await stores.insert({
      id: 'later',
      name: 'Later',
      latitude: -23.5505,
      longitude: -46.6333,
    })).geohash).toBe('6gyf4');
  });

  test('returns record distance and reports missing records or coordinates', async () => {
    const database = createDatabase('distance');
    await database.connect();
    const stores = await createStores(database, true);
    await database.usePlugin(plugin());
    await stores.insert({ id: 'one', name: 'One', latitude: -23.5505, longitude: -46.6333 });
    await stores.insert({ id: 'two', name: 'Two', latitude: -23.5555, longitude: -46.6383 });
    await stores.insert({ id: 'missing', name: 'Missing' });

    const result = await stores.getDistance!('one', 'two');
    expect(result.unit).toBe('km');
    expect(result.distance).toBeGreaterThan(0);
    expect(result.distance).toBeLessThan(1);
    await expect(stores.getDistance!('one', 'absent')).rejects.toBeInstanceOf(GeoError);
    await expect(stores.getDistance!('one', 'missing')).rejects.toThrow('missing coordinates');
  });

  test('removes hooks, helpers, and future-resource setup when stopped', async () => {
    const database = createDatabase('stop');
    await database.connect();
    const stores = await createStores(database);
    const geo = plugin();
    await database.usePlugin(geo);
    await geo.stop();

    expect(stores.findNearby).toBeUndefined();
    expect(stores._geoConfig).toBeUndefined();
    const record = await stores.insert({
      id: 'plain',
      name: 'Plain',
      latitude: -23.5505,
      longitude: -46.6333,
    });
    expect(record._geohash).toBeUndefined();

    const later = await database.createResource({
      name: 'later',
      attributes: { latitude: 'number|required', longitude: 'number|required' },
    });
    expect(later.findNearby).toBeUndefined();
  });

  test('validates configuration before mutating plugin registration', async () => {
    const database = createDatabase('invalid');
    await database.connect();
    const invalid = new GeoPlugin({
      logLevel: 'silent',
      resources: { stores: { latField: 'latitude' } },
    });

    await expect(database.usePlugin(invalid)).rejects.toThrow('must have "latField" and "lonField"');
    expect(database.plugins.geo).toBeUndefined();
    expect(database.pluginList).not.toContain(invalid);
  });

  test('reports normalized configuration stats', () => {
    const geo = new GeoPlugin({
      logLevel: 'silent',
      resources: {
        stores: { latField: 'latitude', lonField: 'longitude', precision: 999 },
        restaurants: { latField: 'lat', lonField: 'lon', precision: 6 },
      },
    });
    expect(geo.getStats()).toEqual({
      resources: 2,
      configurations: [
        {
          resource: 'stores',
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          cellSize: '~4.9km',
        },
        {
          resource: 'restaurants',
          latField: 'lat',
          lonField: 'lon',
          precision: 6,
          cellSize: '~1.2km',
        },
      ],
    });
  });
});
