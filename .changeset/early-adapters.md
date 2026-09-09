---
"@baldin/core": minor
"@baldin/adapter-s3": minor
"@baldin/adapter-sqlite": minor
"@baldin/adapter-filesystem": minor
"@baldin/adapter-memory": minor
"@baldin/adapter-reddb": minor
"@baldin/plugin-audit": minor
"@baldin/plugin-ttl": minor
"@baldin/plugin-scheduler": minor
"@baldin/plugin-fulltext": minor
"@baldin/plugin-geo": minor
"@baldin/plugin-graph": minor
"@baldin/plugin-costs": minor
"@baldin/plugin-metrics": minor
"@baldin/plugin-queue-consumer": minor
"@baldin/plugin-backup": minor
"@baldin/plugin-cache": minor
"@baldin/plugin-state-machine": minor
"@baldin/plugin-tree": minor
"@baldin/plugin-importer": minor
"@baldin/plugin-vector": minor
"@baldin/plugin-smtp": minor
"@baldin/plugin-tournament": minor
"@baldin/testing": minor
"@baldin/typegen": minor
---

Add the storage adapter registry and plugin SDK, extract memory, filesystem, SQLite, libSQL/D1, RedDB, and S3-compatible storage into standalone packages, publish the audit, TTL, scheduler, fulltext, geo, graph, costs, metrics, queue-consumer, backup, cache, state-machine, tree, importer, vector, SMTP, and tournament plugins as standalone packages, publish the testing and type-generation libraries, and introduce provider-neutral storage contract names with deprecated compatibility aliases.
Plugin lifecycle registration now rolls back failed installs and starts, and plugin-owned resource hooks and extensions are disposable.
Connection-string parsing now stays generic in core while each adapter owns its URL,
credential, and provider-option semantics.
Adapters now declare engine capabilities, provider-specific legacy options resolve in
their owning package, and the core exposes canonical provider-neutral errors and utilities.
The core declares its logger formatter directly so isolated package installs do not
depend on transitive dependency hoisting.
