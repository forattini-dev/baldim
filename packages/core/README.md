# @buckiedb/core

Early migration of the provider-independent BuckieDB core. Not yet a database
replacement: this initial package contains only numeric metadata codecs.

```ts
import { encode, decode } from '@buckiedb/core/encoding';

encode(62); // '10'
decode('10'); // 62
```

The original s3db.js numeric encoding implementation is preserved without changes.
Tests exercise the built package export, including decimal and embedding encoding.
Legacy edge-case behavior remains unchanged; this is not a new validation API.
See ../../docs/migration.md for provenance and the remaining extraction work.
