import {
  Plugin,
  mapWithConcurrency,
  tryFn,
  type PluginOptions,
  type ResourceLike,
} from '@baldim/core/plugin';
import type { Resource as CoreResource } from '@baldim/core';
import { GeoError } from './errors.js';

export { GeoError } from './errors.js';
export type { GeoErrorDetails } from './errors.js';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const EARTH_RADIUS_KM = 6371;
const MAX_BOUND_CELLS = 10_000;

export interface GeoResourceConfig {
  latField?: string;
  lonField?: string;
  precision?: number;
  addGeohash?: boolean;
  usePartitions?: boolean;
  zoomLevels?: number[];
}

export interface GeoPluginOptions extends PluginOptions {
  resources?: Record<string, GeoResourceConfig>;
}

export interface FindNearbyOptions {
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
}

export interface FindInBoundsOptions {
  north: number;
  south: number;
  east: number;
  west: number;
  limit?: number;
}

export interface DistanceResult {
  distance: number;
  unit: 'km';
  from: string;
  to: string;
}

export interface GeohashDecodeResult {
  latitude: number;
  longitude: number;
  error: { latitude: number; longitude: number };
}

export interface GeoStats {
  resources: number;
  configurations: Array<{
    resource: string;
    latField: string;
    lonField: string;
    precision: number;
    cellSize: string;
  }>;
}

export interface GetGeohashesInBoundsOptions {
  north: number;
  south: number;
  east: number;
  west: number;
  precision: number;
}

export interface GeoRecord extends Record<string, unknown> {
  id?: string;
}

export interface NearbyRecord extends GeoRecord {
  _distance: number;
}

interface PartitionDefinition {
  fields: Record<string, string>;
}

interface GeoResource extends ResourceLike {
  name: string;
  attributes: Record<string, string | { type?: string; optional?: boolean; [key: string]: unknown }>;
  config: {
    partitions?: Record<string, PartitionDefinition>;
    [key: string]: unknown;
  };
  addPluginAttribute(name: string, definition: string | Record<string, unknown>, pluginName: string): void;
  setupPartitionHooks(): void;
  getOrNull(id: string): Promise<GeoRecord | null>;
  list(options?: { limit?: number }): Promise<GeoRecord[]>;
  listPartition(options: {
    partition: string;
    partitionValues: Record<string, string>;
    limit?: number;
  }): Promise<GeoRecord[]>;
}

declare module '@baldim/core' {
  interface Resource {
    _geoConfig?: GeoResourceConfig;
    findNearby?(options: FindNearbyOptions): Promise<NearbyRecord[]>;
    findInBounds?(options: FindInBoundsOptions): Promise<GeoRecord[]>;
    getDistance?(id1: string, id2: string): Promise<DistanceResult>;
  }
}

function asFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GeoError(`${name} must be a finite number`, {
      operation: 'validateCoordinates',
      coordinates: { [name]: value },
    });
  }
  return value;
}

function validateLatitude(value: unknown, name = 'latitude'): number {
  const latitude = asFiniteNumber(value, name);
  if (latitude < -90 || latitude > 90) {
    throw new GeoError(`${name} must be between -90 and 90`, {
      operation: 'validateCoordinates',
      coordinates: { [name]: value },
    });
  }
  return latitude;
}

function validateLongitude(value: unknown, name = 'longitude'): number {
  const longitude = asFiniteNumber(value, name);
  if (longitude < -180 || longitude > 180) {
    throw new GeoError(`${name} must be between -180 and 180`, {
      operation: 'validateCoordinates',
      coordinates: { [name]: value },
    });
  }
  return longitude;
}

function validatePrecision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) {
    throw new GeoError('Geohash precision must be an integer between 1 and 12', {
      operation: 'validatePrecision',
      precision: value,
    });
  }
  return value;
}

function readCoordinate(value: unknown, min: number, max: number): number | null {
  const coordinate = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

function normalizeLongitude(longitude: number): number {
  if (longitude === 180) return 180;
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function inLongitudeBounds(longitude: number, west: number, east: number): boolean {
  return west <= east
    ? longitude >= west && longitude <= east
    : longitude >= west || longitude <= east;
}

function uniqueRecords(records: GeoRecord[]): GeoRecord[] {
  const seen = new Set<unknown>();
  return records.filter((record) => {
    const key = record.id ?? record;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class GeoPlugin extends Plugin<GeoPluginOptions> {
  resources: Record<string, GeoResourceConfig>;
  readonly base32 = BASE32;

  private _afterCreateResourceHook: ((context: Record<string, unknown>) => Promise<void>) | null = null;
  private _configuredResources = new Set<object>();

  constructor(options: GeoPluginOptions = {}) {
    super(options);
    this.resources = Object.fromEntries(
      Object.entries(options.resources || {}).map(([name, config]) => [
        name,
        {
          ...config,
          precision: this.normalizeConfiguredPrecision(config.precision),
          zoomLevels: config.zoomLevels?.map(validatePrecision),
        },
      ]),
    );
  }

  override async onInstall(): Promise<void> {
    for (const [resourceName, config] of Object.entries(this.resources)) {
      this.validateResourceConfig(resourceName, config);
      await this.setupResource(resourceName, config);
    }

    this._afterCreateResourceHook = async (context) => {
      const resource = context.resource as GeoResource | undefined;
      if (!resource) return;
      const config = this.resources[resource.name];
      if (config) await this.setupResource(resource.name, config);
    };
    this.database.addHook('afterCreateResource', this._afterCreateResourceHook);

    this.logger.debug(
      { resourceCount: Object.keys(this.resources).length },
      `Installed with ${Object.keys(this.resources).length} resources`,
    );
    this.emit('db:plugin:installed', {
      plugin: 'GeoPlugin',
      resources: Object.keys(this.resources),
    });
  }

  override async onStop(): Promise<void> {
    if (this._afterCreateResourceHook) {
      this.database.removeHook('afterCreateResource', this._afterCreateResourceHook);
      this._afterCreateResourceHook = null;
    }
    this._configuredResources.clear();
  }

  override async onUninstall(): Promise<void> {
    this.logger.debug('Uninstalled');
    this.emit('db:plugin:uninstalled', { plugin: 'GeoPlugin' });
  }

  private normalizeConfiguredPrecision(precision: number | undefined): number {
    return typeof precision === 'number' && Number.isInteger(precision) && precision >= 1 && precision <= 12
      ? precision
      : 5;
  }

  private validateResourceConfig(
    resourceName: string,
    config: GeoResourceConfig,
  ): asserts config is GeoResourceConfig & { latField: string; lonField: string; precision: number } {
    if (!config.latField || !config.lonField) {
      throw new GeoError(
        `Resource "${resourceName}" must have "latField" and "lonField" configured`,
        {
          pluginName: 'GeoPlugin',
          operation: 'setupResource',
          resourceName,
          statusCode: 400,
          retriable: false,
        },
      );
    }
    config.precision = this.normalizeConfiguredPrecision(config.precision);
    config.zoomLevels = config.zoomLevels?.map(validatePrecision);
  }

  async setupResource(resourceName: string, config: GeoResourceConfig): Promise<void> {
    this.validateResourceConfig(resourceName, config);
    const resource = this.database.resources[resourceName] as unknown as GeoResource | undefined;
    if (!resource) {
      this.logger.warn(
        { resourceName },
        `Resource "${resourceName}" not found, will setup when created`,
      );
      return;
    }
    if (this._configuredResources.has(resource)) return;

    const latitudeAttribute = resource.attributes[config.latField];
    const longitudeAttribute = resource.attributes[config.lonField];
    const coordinatesOptional =
      (typeof latitudeAttribute === 'object' && latitudeAttribute?.optional === true) ||
      (typeof longitudeAttribute === 'object' && longitudeAttribute?.optional === true) ||
      (typeof latitudeAttribute === 'string' && latitudeAttribute.includes('optional')) ||
      (typeof longitudeAttribute === 'string' && longitudeAttribute.includes('optional'));
    const geohashType = coordinatesOptional ? 'string|optional' : 'string';

    let metadataChanged = false;
    if (config.addGeohash && !resource.attributes.geohash) {
      resource.addPluginAttribute('geohash', geohashType, this.name);
      metadataChanged = true;
    }
    if (!resource.attributes._geohash) {
      resource.addPluginAttribute('_geohash', geohashType, this.name);
      metadataChanged = true;
    }
    for (const zoom of config.zoomLevels || []) {
      const field = `_geohash_zoom${zoom}`;
      if (!resource.attributes[field]) {
        resource.addPluginAttribute(field, geohashType, this.name);
        metadataChanged = true;
      }
    }

    if (config.usePartitions) {
      metadataChanged = this.setupPartitions(resource, config) || metadataChanged;
    }

    const enrich = (value: unknown): unknown => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const data = value as Record<string, unknown>;
      const lat = data[config.latField];
      const lon = data[config.lonField];
      if (lat === undefined || lon === undefined) return data;
      const latitude = validateLatitude(lat, config.latField);
      const longitude = validateLongitude(lon, config.lonField);
      const geohash = this.encodeGeohash(latitude, longitude, config.precision);
      if (config.addGeohash) data.geohash = geohash;
      data._geohash = geohash;
      for (const zoom of config.zoomLevels || []) {
        data[`_geohash_zoom${zoom}`] = this.encodeGeohash(latitude, longitude, zoom);
      }
      return data;
    };

    this.addResourceHook(resource, 'beforeInsert', enrich);
    this.addResourceHook(resource, 'beforeUpdate', enrich);
    this.extendResource(resource, {
      _geoConfig: config,
      findNearby: (options: FindNearbyOptions) => this.findNearby(resource, config, options),
      findInBounds: (options: FindInBoundsOptions) => this.findInBounds(resource, config, options),
      getDistance: (id1: string, id2: string) => this.getDistance(resource, config, id1, id2),
    });
    this._configuredResources.add(resource);

    if (metadataChanged) await this.database.uploadMetadataFile();
  }

  setupPartitions(resource: GeoResource, config: GeoResourceConfig): boolean {
    const partitions = { ...(resource.config.partitions || {}) };
    let changed = false;

    if (config.zoomLevels?.length) {
      for (const zoom of config.zoomLevels) {
        const name = `byGeohashZoom${zoom}`;
        if (!partitions[name]) {
          partitions[name] = { fields: { [`_geohash_zoom${zoom}`]: 'string' } };
          changed = true;
        }
      }
    } else if (!partitions.byGeohash) {
      partitions.byGeohash = { fields: { _geohash: 'string' } };
      changed = true;
    }

    if (changed) {
      resource.config = { ...resource.config, partitions };
      resource.setupPartitionHooks();
    }
    return changed;
  }

  async findNearby(
    resource: GeoResource,
    config: GeoResourceConfig,
    options: FindNearbyOptions,
  ): Promise<NearbyRecord[]> {
    const lat = validateLatitude(options?.lat, 'lat');
    const lon = validateLongitude(options?.lon, 'lon');
    const radius = asFiniteNumber(options?.radius ?? 10, 'radius');
    const limit = asFiniteNumber(options?.limit ?? 100, 'limit');
    if (radius < 0) throw new GeoError('radius must be greater than or equal to zero', { operation: 'findNearby' });
    if (!Number.isInteger(limit) || limit < 1) throw new GeoError('limit must be a positive integer', { operation: 'findNearby' });

    const longitudeRadius = radius / Math.max(0.01, 111 * Math.cos(this.toRadians(lat)));
    const records = await this.loadCandidates(resource, config, {
      north: Math.min(90, lat + radius / 111),
      south: Math.max(-90, lat - radius / 111),
      west: normalizeLongitude(lon - longitudeRadius),
      east: normalizeLongitude(lon + longitudeRadius),
      limit,
      radius,
      logLabel: `${radius}km radius query`,
    });

    return uniqueRecords(records)
      .map((record) => {
        const recordLat = readCoordinate(record[config.latField!], -90, 90);
        const recordLon = readCoordinate(record[config.lonField!], -180, 180);
        if (recordLat === null || recordLon === null) return null;
        return { ...record, _distance: this.calculateDistance(lat, lon, recordLat, recordLon) };
      })
      .filter((record): record is NearbyRecord => record !== null && record._distance <= radius)
      .sort((left, right) => left._distance - right._distance)
      .slice(0, limit);
  }

  async findInBounds(
    resource: GeoResource,
    config: GeoResourceConfig,
    options: FindInBoundsOptions,
  ): Promise<GeoRecord[]> {
    const north = validateLatitude(options?.north, 'north');
    const south = validateLatitude(options?.south, 'south');
    const east = validateLongitude(options?.east, 'east');
    const west = validateLongitude(options?.west, 'west');
    const limit = asFiniteNumber(options?.limit ?? 100, 'limit');
    if (north < south) throw new GeoError('north must be greater than or equal to south', { operation: 'findInBounds' });
    if (!Number.isInteger(limit) || limit < 1) throw new GeoError('limit must be a positive integer', { operation: 'findInBounds' });

    const centerLat = (north + south) / 2;
    const centerLon = west <= east ? (west + east) / 2 : normalizeLongitude((west + east + 360) / 2);
    const radius = Math.max(
      this.calculateDistance(centerLat, centerLon, north, centerLon),
      this.calculateDistance(centerLat, centerLon, centerLat, east),
    );
    const records = await this.loadCandidates(resource, config, {
      north, south, east, west, limit, radius,
      logLabel: `${radius.toFixed(1)}km bounding box`,
    });

    return uniqueRecords(records)
      .filter((record) => {
        const lat = readCoordinate(record[config.latField!], -90, 90);
        const lon = readCoordinate(record[config.lonField!], -180, 180);
        return lat !== null && lon !== null &&
          lat <= north && lat >= south && inLongitudeBounds(lon, west, east);
      })
      .slice(0, limit);
  }

  async getDistance(
    resource: GeoResource,
    config: GeoResourceConfig,
    id1: string,
    id2: string,
  ): Promise<DistanceResult> {
    const [firstResult, secondResult] = await Promise.all([
      tryFn(() => resource.getOrNull(id1)),
      tryFn(() => resource.getOrNull(id2)),
    ]);
    const first = firstResult[0] ? firstResult[2] : null;
    const second = secondResult[0] ? secondResult[2] : null;
    if (!first || !second) {
      throw new GeoError('One or both records not found for distance calculation', {
        operation: 'getDistance',
        resourceName: resource.name,
        ids: [id1, id2],
        statusCode: 404,
      });
    }

    const lat1 = readCoordinate(first[config.latField!], -90, 90);
    const lon1 = readCoordinate(first[config.lonField!], -180, 180);
    const lat2 = readCoordinate(second[config.latField!], -90, 90);
    const lon2 = readCoordinate(second[config.lonField!], -180, 180);
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
      throw new GeoError('One or both records are missing coordinates', {
        operation: 'getDistance',
        resourceName: resource.name,
        ids: [id1, id2],
        statusCode: 422,
      });
    }

    return {
      distance: this.calculateDistance(lat1, lon1, lat2, lon2),
      unit: 'km',
      from: id1,
      to: id2,
    };
  }

  private async loadCandidates(
    resource: GeoResource,
    config: GeoResourceConfig,
    bounds: FindInBoundsOptions & { radius: number; logLabel: string },
  ): Promise<GeoRecord[]> {
    if (!config.usePartitions) return resource.list({ limit: bounds.limit! * 10 });

    const precision = config.zoomLevels?.length
      ? this.selectOptimalZoom(config.zoomLevels, bounds.radius)
      : config.precision!;
    const partitionName = config.zoomLevels?.length ? `byGeohashZoom${precision}` : 'byGeohash';
    const fieldName = config.zoomLevels?.length ? `_geohash_zoom${precision}` : '_geohash';

    if (!resource.config.partitions?.[partitionName]) {
      return resource.list({ limit: bounds.limit! * 10 });
    }

    if (config.zoomLevels?.length) {
      this.logger.debug(
        { resourceName: resource.name, precision },
        `Auto-selected zoom${precision} (${this.getPrecisionDistance(precision)}km cells) for ${bounds.logLabel}`,
      );
    }

    const hashes = this.getGeohashesInBounds({
      north: bounds.north,
      south: bounds.south,
      east: bounds.east,
      west: bounds.west,
      precision,
    });
    const { results } = await mapWithConcurrency(
      hashes,
      async (geohash) => {
        const [ok, , records] = await tryFn(() => resource.listPartition({
          partition: partitionName,
          partitionValues: { [fieldName]: geohash },
          limit: bounds.limit! * 2,
        }));
        return ok && records ? records : [];
      },
      { concurrency: 15 },
    );

    this.logger.debug(
      { resourceName: resource.name, partitions: hashes.length, candidates: results.flat().length },
      `${bounds.logLabel} searched ${hashes.length} ${partitionName} partitions`,
    );
    return results.flat();
  }

  encodeGeohash(latitude: number, longitude: number, precision = 5): string {
    validateLatitude(latitude);
    validateLongitude(longitude);
    validatePrecision(precision);

    let index = 0;
    let bit = 0;
    let longitudeBit = true;
    let result = '';
    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    while (result.length < precision) {
      if (longitudeBit) {
        const middle = (lonMin + lonMax) / 2;
        if (longitude > middle) {
          index |= 1 << (4 - bit);
          lonMin = middle;
        } else {
          lonMax = middle;
        }
      } else {
        const middle = (latMin + latMax) / 2;
        if (latitude > middle) {
          index |= 1 << (4 - bit);
          latMin = middle;
        } else {
          latMax = middle;
        }
      }
      longitudeBit = !longitudeBit;
      if (bit < 4) {
        bit++;
      } else {
        result += BASE32[index];
        bit = 0;
        index = 0;
      }
    }
    return result;
  }

  decodeGeohash(geohash: string): GeohashDecodeResult {
    if (!geohash || geohash.length > 12) {
      throw new GeoError('Geohash must contain between 1 and 12 characters', {
        operation: 'decodeGeohash',
        geohash,
      });
    }

    let longitudeBit = true;
    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    for (const character of geohash.toLowerCase()) {
      const index = BASE32.indexOf(character);
      if (index < 0) {
        throw new GeoError(`Invalid geohash character: ${character}`, {
          operation: 'decodeGeohash',
          geohash,
        });
      }
      for (let bit = 4; bit >= 0; bit--) {
        const set = (index >> bit) & 1;
        if (longitudeBit) {
          const middle = (lonMin + lonMax) / 2;
          if (set) lonMin = middle;
          else lonMax = middle;
        } else {
          const middle = (latMin + latMax) / 2;
          if (set) latMin = middle;
          else latMax = middle;
        }
        longitudeBit = !longitudeBit;
      }
    }

    return {
      latitude: (latMin + latMax) / 2,
      longitude: (lonMin + lonMax) / 2,
      error: { latitude: latMax - latMin, longitude: lonMax - lonMin },
    };
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    validateLatitude(lat1, 'lat1');
    validateLongitude(lon1, 'lon1');
    validateLatitude(lat2, 'lat2');
    validateLongitude(lon2, 'lon2');
    const deltaLat = this.toRadians(lat2 - lat1);
    const deltaLon = this.toRadians(lon2 - lon1);
    const value =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  getNeighbors(geohash: string): string[] {
    const decoded = this.decodeGeohash(geohash);
    const directions: Array<[number, number]> = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1],
    ];
    return [...new Set(directions.map(([latDirection, lonDirection]) =>
      this.encodeGeohash(
        Math.max(-90, Math.min(90, decoded.latitude + latDirection * decoded.error.latitude)),
        normalizeLongitude(decoded.longitude + lonDirection * decoded.error.longitude),
        geohash.length,
      ),
    ))];
  }

  getGeohashesInBounds(options: GetGeohashesInBoundsOptions): string[] {
    const north = validateLatitude(options.north, 'north');
    const south = validateLatitude(options.south, 'south');
    const east = validateLongitude(options.east, 'east');
    const west = validateLongitude(options.west, 'west');
    const precision = validatePrecision(options.precision);
    if (north < south) {
      throw new GeoError('north must be greater than or equal to south', { operation: 'getGeohashesInBounds' });
    }

    const cellSize = this.getPrecisionDistance(precision);
    const latStep = Math.max(cellSize / 111, Number.EPSILON);
    const centerLatitude = (north + south) / 2;
    const lonStep = Math.max(
      cellSize / Math.max(0.01, 111 * Math.abs(Math.cos(this.toRadians(centerLatitude)))),
      Number.EPSILON,
    );
    const longitudeRanges: Array<[number, number]> =
      west <= east ? [[west, east]] : [[west, 180], [-180, east]];
    const latitudeSteps = Math.ceil((north - south) / latStep) + 1;
    const longitudeSteps = longitudeRanges.reduce(
      (count, [start, end]) => count + Math.ceil((end - start) / lonStep) + 1,
      0,
    );
    if (latitudeSteps * longitudeSteps > MAX_BOUND_CELLS) {
      throw new GeoError(`Bounding box requires more than ${MAX_BOUND_CELLS} geohash cells`, {
        operation: 'getGeohashesInBounds',
        precision,
      });
    }

    const hashes = new Set<string>();
    for (let latitude = south; latitude <= north; latitude += latStep) {
      for (const [start, end] of longitudeRanges) {
        for (let longitude = start; longitude <= end; longitude += lonStep) {
          hashes.add(this.encodeGeohash(latitude, longitude, precision));
        }
      }
    }
    for (const latitude of [north, south, (north + south) / 2]) {
      for (const longitude of [west, east]) {
        hashes.add(this.encodeGeohash(latitude, longitude, precision));
      }
    }
    return [...hashes];
  }

  /** @deprecated Use getGeohashesInBounds(). */
  _getGeohashesInBounds(options: GetGeohashesInBoundsOptions): string[] {
    return this.getGeohashesInBounds(options);
  }

  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  getPrecisionDistance(precision: number): number {
    const distances: Record<number, number> = {
      1: 5000, 2: 1250, 3: 156, 4: 39, 5: 4.9, 6: 1.2,
      7: 0.15, 8: 0.038, 9: 0.0047, 10: 0.0012,
      11: 0.00015, 12: 0.000037,
    };
    return distances[precision] || 5;
  }

  /** @deprecated Use getPrecisionDistance(). */
  _getPrecisionDistance(precision: number): number {
    return this.getPrecisionDistance(precision);
  }

  selectOptimalZoom(zoomLevels: number[], radiusKm: number): number {
    if (!zoomLevels.length) {
      throw new GeoError('At least one zoom level is required', { operation: 'selectOptimalZoom' });
    }
    return zoomLevels.reduce((best, current) =>
      Math.abs(this.getPrecisionDistance(current) - radiusKm / 2.5) <
      Math.abs(this.getPrecisionDistance(best) - radiusKm / 2.5)
        ? current
        : best,
    );
  }

  /** @deprecated Use selectOptimalZoom(). */
  _selectOptimalZoom(zoomLevels: number[], radiusKm: number): number | null {
    return zoomLevels.length ? this.selectOptimalZoom(zoomLevels, radiusKm) : null;
  }

  getStats(): GeoStats {
    return {
      resources: Object.keys(this.resources).length,
      configurations: Object.entries(this.resources).map(([resource, config]) => ({
        resource,
        latField: config.latField!,
        lonField: config.lonField!,
        precision: config.precision!,
        cellSize: `~${this.getPrecisionDistance(config.precision!)}km`,
      })),
    };
  }
}

export type GeoResourceMethods = Pick<
  CoreResource,
  '_geoConfig' | 'findNearby' | 'findInBounds' | 'getDistance'
>;

export default GeoPlugin;
