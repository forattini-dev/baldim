---
"@baldin/plugin-identity": minor
"@baldin/core": patch
"@baldin/plugin-api": patch
---

Extract the OAuth2/OIDC identity provider into its own Raffel-based package with
sessions, onboarding, account protection, optional MFA and email integrations,
the administrative UI, public auth drivers, and a live-server contract test.
Expose the complete public password configuration types required by Identity.
Let API tests bind an operating-system-assigned port and report that bound port
so parallel workspace runs cannot collide on a randomly selected port.
