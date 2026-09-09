# @baldim/typegen

Generate a typed resource map from a connected Baldim database.

```ts
import { generateTypes } from '@baldim/typegen';

await generateTypes(database, { outputPath: './src/database.generated.ts' });
```

The generated module exports one interface per resource, `ResourceMap`, `TypedResource<T>`, and `TypedDatabase`. The default runtime import is `@baldim/core`.
