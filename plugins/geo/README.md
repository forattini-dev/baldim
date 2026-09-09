# @baldim/plugin-geo

Geohash fields, optional geohash partitions, distance calculation, and spatial queries for Baldim resources.

```ts
import { Baldim } from '@baldim/core';
import { GeoPlugin } from '@baldim/plugin-geo';

const db = new Baldim({ connectionString: 'memory://locations' });
await db.connect();
const stores = await db.createResource({
  name: 'stores',
  attributes: {
    name: 'string|required',
    latitude: 'number|required',
    longitude: 'number|required',
  },
});

await db.usePlugin(new GeoPlugin({
  resources: {
    stores: {
      latField: 'latitude',
      lonField: 'longitude',
      precision: 6,
      addGeohash: true,
      usePartitions: true,
      zoomLevels: [4, 5, 6],
    },
  },
}));

await stores.insert({
  id: 'central',
  name: 'Central',
  latitude: -23.5505,
  longitude: -46.6333,
});

const nearby = await stores.findNearby!({
  lat: -23.55,
  lon: -46.63,
  radius: 5,
});
```

Coordinates use decimal degrees, distances use kilometers, and precision accepts integers from 1 through 12. Resource helper methods exist while the plugin is running and are removed when it stops.
