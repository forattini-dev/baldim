# @baldim/adapter-s3

S3-compatible storage for Baldim. Importing the package registers the `s3:`,
`http:`, and `https:` protocols with `@baldim/core`.

```ts
import { Baldim } from '@baldim/core';
import '@baldim/adapter-s3';

const database = new Baldim({
  connectionString: process.env.BALDIM_URL!,
});
```

The same adapter supports AWS S3, Cloudflare R2, Floci, and other services that
implement the S3 API. Endpoint, credentials, path-style addressing, retry, and
transport options remain part of the connection string and `clientOptions`.

You can also instantiate the client directly:

```ts
import { S3Client } from '@baldim/adapter-s3';

const client = new S3Client({ connectionString: process.env.BALDIM_URL! });
```

## Multipart upload

The client implements multipart uploads and reports the `multipartUpload`
capability. Use `putObjectMultipart()` for large bodies: it chunks the body,
uploads parts in parallel, aborts automatically when a part fails, and reports
progress:

```ts
await client.putObjectMultipart({
  key: 'videos/big.bin',
  body: stream, // Buffer, string, or Readable
  partSize: 16 * 1024 * 1024,
  queueConcurrency: 4,
  onProgress: ({ uploadedBytes }) => console.log(uploadedBytes),
});
```

The underlying primitives are exposed as well: `createMultipartUpload()`,
`uploadPart()`, `completeMultipartUpload()`, `abortMultipartUpload()`,
`listParts()`, and `listMultipartUploads()`. Part size defaults to 8 MiB and
must respect the S3 5 MiB minimum whenever the body needs more than one part.

Resources created through `@baldim/core` can opt into multipart on insert:

```ts
await notes.insert({ id: 'big-one', title: 'Large record' }, { multipart: true });
await notes.insert(
  { id: 'big-two', title: 'Large record' },
  { multipart: { partSize: 16 * 1024 * 1024, queueConcurrency: 2 } },
);
```

Because multipart completion does not support `IfNoneMatch`, uniqueness of the
id is enforced with a pre-check instead of the atomic conditional write used by
the regular path.

## Local integration tests

CI uses [Floci](https://github.com/floci-io/floci), an MIT-licensed local AWS
emulator, to run the shared storage contract and persisted-data compatibility
tests. Run them locally with the same pinned image:

```sh
docker run --detach --name baldim-floci \
  --publish 127.0.0.1:4566:4566 \
  --env FLOCI_STORAGE_MODE=memory \
  --env FLOCI_SERVICES_UI_ENABLED=false \
  floci/floci:2.2.0

# Wait until the emulator is ready.
curl --fail --retry 60 --retry-delay 1 --retry-connrefused --retry-all-errors \
  --connect-timeout 1 --max-time 2 http://127.0.0.1:4566/_floci/health

BALDIM_S3_CONTRACT_URL='http://test:test@127.0.0.1:4566/baldim-contract?region=us-east-1&forcePathStyle=true' \
  pnpm --filter @baldim/adapter-s3 exec vitest run \
  tests/storage-contract.test.ts tests/compatibility.test.ts

docker rm --force baldim-floci
```

The tests create the bucket automatically; `test` credentials are local dummy
values. Set `BALDIM_S3_CONTRACT_URL` to target another isolated S3-compatible
bucket. The compatibility fixture was originally captured from `s3db.js` 21.6.2
using MinIO; CI now loads those unchanged objects into Floci and verifies that
Baldim reads them without rewriting them.
