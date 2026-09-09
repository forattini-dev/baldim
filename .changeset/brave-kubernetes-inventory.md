---
"@baldin/core": patch
"@baldin/plugin-kubernetes-inventory": minor
---

Add the standalone KubernetesInventory plugin with cluster discovery, current
snapshots, immutable versions, configuration diffs, scheduling, filtering, and
an injectable driver boundary. Declare the Kubernetes client, cron scheduler,
and processing libraries in the plugin package, and support comma-separated
enum values in compact core schemas.
