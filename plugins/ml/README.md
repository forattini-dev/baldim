# @baldin/plugin-ml

TensorFlow.js models backed by Baldin resources and plugin storage.

```ts
import { Baldin } from '@baldin/core';
import { MLPlugin } from '@baldin/plugin-ml';

const database = new Baldin({ connectionString: 'memory://models' });
await database.connect();
await database.usePlugin(new MLPlugin({
  models: {
    price: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin'],
      target: 'price',
      modelConfig: { epochs: 20 },
    },
  },
}), 'ml');
```

The package owns its pure JavaScript `@tensorflow/tfjs` runtime. Applications
do not need native TensorFlow bindings to install Baldin or this plugin.
