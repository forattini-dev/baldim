# Compatibility boundaries

Baldin uses its own name for new APIs, logs, workers, documentation, and environment
variables. The remaining `s3db` and S3-shaped names are deliberate compatibility
contracts or belong to the S3 adapter.

## Persisted data

- `s3db.json`, `s3dbVersion`, `s3db.json.corrupted.*`, `s3db-core`, and
  `s3db-metadata` remain unchanged so existing stores open without moving keys.
- `s3db-mac` and `s3db-currency` are serialized schema tags and remain readable and
  writable until a versioned data migration exists.
- The S3 URL dictionary tokens remain stable because changing them would corrupt
  compressed persisted values.
- The historical default container name, local directory, and SQLite filename keep
  `s3db` in their values to avoid silently selecting an empty database after upgrade.

## Operational configuration

New deployments should use `BALDIN_*`. Every former `S3DB_*` environment variable
remains a fallback, with the `BALDIN_*` value taking precedence when both are set.

## Public API aliases

`S3db`, `S3dbError`, `mapAwsError`, `S3Object`, `S3ObjectInfo`,
`S3_METADATA_LIMIT_BYTES`, and `S3DBLogger` remain deprecated aliases. Canonical code
uses `Baldin`, `StorageError`, `mapStorageError`, `StorageObject`,
`DEFAULT_METADATA_LIMIT_BYTES`, and `BaldinLogger`.

Provider names in `@baldin/adapter-s3` are current domain names for that package and
do not leak storage selection or provider behavior into `@baldin/core`.
