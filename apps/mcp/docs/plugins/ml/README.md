# @baldim/plugin-ml

TensorFlow.js models backed by Baldim resources and plugin storage.

```ts
import { Baldim } from '@baldim/core';
import { MLPlugin } from '@baldim/plugin-ml';

const database = new Baldim({ connectionString: 'memory://models' });
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
do not need native TensorFlow bindings to install Baldim or this plugin.
