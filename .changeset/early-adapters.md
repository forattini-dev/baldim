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
---

Add the storage adapter registry and plugin SDK, extract memory, filesystem, SQLite, libSQL/D1, RedDB, and S3-compatible storage into standalone packages, publish the audit, TTL, scheduler, and fulltext plugins as standalone packages, and introduce provider-neutral storage contract names with deprecated compatibility aliases.
Connection-string parsing now stays generic in core while each adapter owns its URL,
credential, and provider-option semantics.
Adapters now declare engine capabilities, provider-specific legacy options resolve in
their owning package, and the core exposes canonical provider-neutral errors and utilities.
