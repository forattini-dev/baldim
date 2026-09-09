# @baldin/plugin-metrics

## 0.1.0

### Minor Changes

- 7662680: Add the storage adapter registry and plugin SDK, extract memory, filesystem, SQLite, libSQL/D1, RedDB, and S3-compatible storage into standalone packages, publish the audit, TTL, scheduler, fulltext, geo, graph, costs, metrics, queue-consumer, backup, cache, state-machine, tree, importer, vector, SMTP, tournament, and S3 queue plugins as standalone packages, publish the testing and type-generation libraries, and introduce provider-neutral storage contract names with deprecated compatibility aliases.
  Plugin lifecycle registration now rolls back failed installs and starts, and plugin-owned resource hooks and extensions are disposable.
  Connection-string parsing now stays generic in core while each adapter owns its URL,
  credential, and provider-option semantics.
  Adapters now declare engine capabilities, provider-specific legacy options resolve in
  their owning package, and the core exposes canonical provider-neutral errors and utilities.
  The core declares its logger formatter directly so isolated package installs do not
  depend on transitive dependency hoisting.

### Patch Changes

- Updated dependencies [7662680]
  - @baldin/core@0.1.0
