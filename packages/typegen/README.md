# @baldin/typegen

Generate a typed resource map from a connected Baldin database.

```ts
import { generateTypes } from '@baldin/typegen';

await generateTypes(database, { outputPath: './src/database.generated.ts' });
```

The generated module exports one interface per resource, `ResourceMap`, `TypedResource<T>`, and `TypedDatabase`. The default runtime import is `@baldin/core`.
