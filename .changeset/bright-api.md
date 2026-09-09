---
"@baldin/plugin-api": minor
"@baldin/core": patch
---

Migrate the API plugin as an independent Raffel-based package with HTTP and WebSocket resource routes, authentication, OpenAPI/USD documentation, static files, health checks, and runtime inspection. Expose the core password helpers needed by authentication through the provider-neutral `@baldin/core/password` subpath.
