---
'@baldim/core': major
'@baldim/adapter-s3': major
'@baldim/adapter-memory': major
'@baldim/plugin-geo': major
'@baldim/plugin-backup': major
---

Remove all retrocompatibility from the public API

- Removed deprecated aliases: `BuckieDB`, `S3db`, `S3dbError`, `S3dbErrorDetails`, `mapAwsError`, `MapAwsErrorContext`, `S3Object`, `S3ObjectInfo`, `PutObjectParams`, `CopyObjectParams`, `ListObjectsParams`, `PutObjectResponse`, `CopyObjectResponse`, `DeleteObjectResponse`, `DeleteObjectsResponse`, `ListObjectsResponse`, `S3DBLogger`, `S3_METADATA_LIMIT_BYTES` — use the canonical `Baldim`/`Storage*` names.
- Removed the legacy connection-string resolution path: adapters no longer accept loose `bucket`/`region`/`credentials` options; pass `connectionString`.
- Removed the `S3DB_*` environment fallbacks: only `BALDIM_*` is read.
- Removed the `awsMessage` error field and the retry option aliases (`retryCoordination`, `awsMaxAttempts`, `awsRetryMode`, `'aws-only'`).
- plugin-geo: removed deprecated `_getGeohashesInBounds`, `_getPrecisionDistance`, `_selectOptimalZoom` methods.
- plugin-backup: removed deprecated `overwrite` option (use `mode: 'replace'`).
