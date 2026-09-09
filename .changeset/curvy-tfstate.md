---
'@baldin/plugin-tfstate': minor
'@baldin/adapter-s3': patch
---

Add the standalone Terraform and OpenTofu state plugin with filesystem and S3 drivers, history, diffs, monitoring, and exports.

Use Recker's narrow public subpaths in the S3 adapter so it does not inherit
unrelated Raffel transports in an otherwise empty consumer project.
