# @baldin/plugin-recon

Modular reconnaissance for Baldin, with DNS, certificates, HTTP, ports, subdomains, web discovery, vulnerability, TLS, fingerprinting, screenshots, OSINT, ASN, and reporting stages.

```ts
import { ReconPlugin } from '@baldin/plugin-recon';

const recon = new ReconPlugin({
  behavior: 'passive',
  resources: { persist: false },
});

const report = await recon.scan('example.com');
```

The package owns Recker and its optional RedBlue SDK integration. System tools used by individual active stages are checked at runtime.
