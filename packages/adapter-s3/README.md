# @buckiedb/adapter-s3

S3-compatible storage for BuckieDB. Importing the package registers the `s3:`,
`http:`, and `https:` protocols with `@buckiedb/core`.

```ts
import { BuckieDB } from '@buckiedb/core';
import '@buckiedb/adapter-s3';

const database = new BuckieDB({
  connectionString: process.env.BUCKIEDB_URL!,
});
```

The same adapter supports AWS S3, Cloudflare R2, MinIO, and other services that
implement the S3 API. Endpoint, credentials, path-style addressing, retry, and
transport options remain part of the connection string and `clientOptions`.

You can also instantiate the client directly:

```ts
import { S3Client } from '@buckiedb/adapter-s3';

const client = new S3Client({ connectionString: process.env.BUCKIEDB_URL! });
```