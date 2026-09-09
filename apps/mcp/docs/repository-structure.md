# Repository structure

Baldim is organized around packages that can be built, tested, versioned, and
published independently. The package boundary comes before the source-code
boundary, so every package owns its own `src/`, `package.json`, tests, and
dependencies.

```text
baldim/
|-- core/                 @baldim/core
|   |-- src/
|   `-- tests/
|-- adapters/
|   `-- <adapter>/        @baldim/adapter-<adapter>
|       |-- src/
|       `-- tests/
|-- plugins/
|   `-- <plugin>/         @baldim/plugin-<plugin>
|       |-- src/
|       `-- tests/
|-- packages/
|   `-- <library>/        @baldim/<library>
|       |-- src/
|       `-- tests/
`-- apps/
    `-- <application>/
```

## Directory responsibilities

- `core/` owns the database engine, resource model, generic storage contracts,
  adapter registry, multidatabase manager, and plugin SDK. Provider clients and
  provider-specific connection behavior do not belong here.
- `adapters/` contains storage implementations. Every adapter owns its provider
  dependencies and registers itself through the public core contract. The memory
  adapter is still a separate package even though core installs it to make
  `memory:` available by default.
- `plugins/` contains optional database capabilities. Every plugin owns its
  runtime integrations and their dependencies. A plugin can expose several
  closely related drivers when they implement the same capability.
- `packages/` contains reusable libraries with a clear public purpose, such as
  test factories or type generation. Code belongs here only after at least two
  consumers need the same abstraction; this directory is not a miscellaneous
  utility bucket.
- `apps/` contains executable products such as the CLI, MCP server, documentation
  site, examples, and demos. Applications may compose any published package.

## Dependency direction

```text
apps ----------------> core, adapters, plugins, packages
plugins -------------> core, packages
adapters ------------> core contracts, packages
packages ------------> core contracts when their public purpose requires them
core ----------------> adapter-memory package for the default memory: experience
```

The memory adapter is designed without a runtime dependency on core, so installing
it from core does not create a package cycle. Other provider implementations must
not be imported by core. Cross-package imports use public package exports instead
of reaching into another package's `src/` tree.

Protocol runtimes follow the same ownership rule. API owns Raffel for its HTTP and
WebSocket listeners, Identity owns Raffel for its standalone OAuth/OIDC server,
WebSocket owns Raffel for its dedicated real-time server, and SMTP owns Raffel for
its SMTP adapter. None of those plugins obtains Raffel transitively from another
plugin, and core and storage adapters do not depend on it.
