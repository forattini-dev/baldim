# @baldin/plugin-tfstate

## 0.1.0

### Minor Changes

- 43ffc77: Add the standalone Terraform and OpenTofu state plugin with filesystem and S3 drivers, history, diffs, monitoring, and exports.
  
  Use Recker's narrow public subpaths in the S3 adapter so it does not inherit
  unrelated Raffel transports in an otherwise empty consumer project.

### Patch Changes

- Updated dependencies [e8d2143]
- Updated dependencies [e9c3a78]
- Updated dependencies [6ed3bd3]
- Updated dependencies [43ffc77]
- Updated dependencies [206ba95]
- Updated dependencies [f686e95]
- Updated dependencies [e150c2f]
  - @baldin/core@0.2.0
  - @baldin/adapter-s3@0.1.1
