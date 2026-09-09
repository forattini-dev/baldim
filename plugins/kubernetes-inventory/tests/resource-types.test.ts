import { describe, expect, it } from 'vitest';
import {
  COMMON_FILTERS,
  CORE_RESOURCE_TYPES,
  findResourceType,
  formatResourceTypeId,
  parseResourceTypeId,
} from '../src/index.js';

describe('Kubernetes resource type catalog', () => {
  it('round-trips core and grouped identifiers', () => {
    const namespace = CORE_RESOURCE_TYPES.find((type) => type.kind === 'Namespace')!;
    expect(formatResourceTypeId(namespace)).toBe('core.v1.Namespace');
    expect(parseResourceTypeId('core.v1.Namespace')).toEqual({ group: '', version: 'v1', kind: 'Namespace' });
    expect(parseResourceTypeId('apps.v1.Deployment')).toEqual({ group: 'apps', version: 'v1', kind: 'Deployment' });
    expect(findResourceType('apps.v1.Deployment')?.plural).toBe('deployments');
  });

  it('rejects malformed identifiers and exposes useful catalog filters', () => {
    expect(() => parseResourceTypeId('Deployment')).toThrow(/Expected format/);
    expect(CORE_RESOURCE_TYPES.filter(COMMON_FILTERS.namespacedOnly).length).toBeGreaterThan(0);
    expect(CORE_RESOURCE_TYPES.filter(COMMON_FILTERS.clusterScopedOnly).length).toBeGreaterThan(0);
  });
});
