# @baldim/core

## 0.2.0

### Minor Changes

- 6ed3bd3: Publish the remaining reusable utilities and explicit compatibility subpaths for core concerns and API guards/failban helpers.

### Patch Changes

- e8d2143: Add the standalone KubernetesInventory plugin with cluster discovery, current
  snapshots, immutable versions, configuration diffs, scheduling, filtering, and
  an injectable driver boundary. Declare the Kubernetes client, cron scheduler,
  and processing libraries in the plugin package, and support comma-separated
  enum values in compact core schemas.
- e9c3a78: Migrate the API plugin as an independent Raffel-based package with HTTP and WebSocket resource routes, authentication, OpenAPI/USD documentation, static files, health checks, and runtime inspection. Expose the core password helpers needed by authentication through the provider-neutral `@baldim/core/password` subpath.
- f686e95: Extract the OAuth2/OIDC identity provider into its own Raffel-based package with
  sessions, onboarding, account protection, optional MFA and email integrations,
  the administrative UI, public auth drivers, and a live-server contract test.
  Expose the complete public password configuration types required by Identity.
  Let API tests bind an operating-system-assigned port and report that bound port
  so parallel workspace runs cannot collide on a randomly selected port.
- e150c2f: Keep similarly named partition namespaces isolated during updates and add the standalone eventual-consistency plugin with record-scoped consolidation, coordinated workers, analytics, and lifecycle-safe resource helpers.

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
  - @baldim/adapter-memory@0.1.0
