# @baldim/plugin-api

## 0.1.0

### Minor Changes

- e9c3a78: Migrate the API plugin as an independent Raffel-based package with HTTP and WebSocket resource routes, authentication, OpenAPI/USD documentation, static files, health checks, and runtime inspection. Expose the core password helpers needed by authentication through the provider-neutral `@baldim/core/password` subpath.
- 6ed3bd3: Publish the remaining reusable utilities and explicit compatibility subpaths for core concerns and API guards/failban helpers.

### Patch Changes

- f686e95: Extract the OAuth2/OIDC identity provider into its own Raffel-based package with
  sessions, onboarding, account protection, optional MFA and email integrations,
  the administrative UI, public auth drivers, and a live-server contract test.
  Expose the complete public password configuration types required by Identity.
  Let API tests bind an operating-system-assigned port and report that bound port
  so parallel workspace runs cannot collide on a randomly selected port.
- Updated dependencies [e8d2143]
- Updated dependencies [e9c3a78]
- Updated dependencies [6ed3bd3]
- Updated dependencies [f686e95]
- Updated dependencies [e150c2f]
  - @baldim/core@0.2.0
