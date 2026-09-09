---
'@baldin/plugin-tfstate': minor
'@baldin/adapter-s3': patch
---

Add the standalone Terraform and OpenTofu state plugin with filesystem and S3 drivers, history, diffs, monitoring, and exports.

Declare the S3 adapter's transitive Raffel runtime requirement so the adapter can load in an otherwise empty consumer project.
