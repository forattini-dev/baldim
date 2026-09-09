# @baldin/plugin-identity

## 0.1.0

### Minor Changes

- f686e95: Extract the OAuth2/OIDC identity provider into its own Raffel-based package with
  sessions, onboarding, account protection, optional MFA and email integrations,
  the administrative UI, public auth drivers, and a live-server contract test.
  Expose the complete public password configuration types required by Identity.
  Let API tests bind an operating-system-assigned port and report that bound port
  so parallel workspace runs cannot collide on a randomly selected port.

### Patch Changes

- dba3973: Update the optional form-data and Nodemailer runtimes to patched releases before publication.
- Updated dependencies [e8d2143]
- Updated dependencies [e9c3a78]
- Updated dependencies [6ed3bd3]
- Updated dependencies [f686e95]
- Updated dependencies [e150c2f]
  - @baldin/core@0.2.0
  - @baldin/plugin-audit@0.1.1
