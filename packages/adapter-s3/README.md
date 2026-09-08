# Planned: @buckiedb/adapter-s3

Reserved source directory, not yet an installable package.

Extract the S3 client after the core storage contract is characterized. AWS S3,
Cloudflare R2 and compatible endpoints should share this adapter where their API
semantics permit it. Provider-specific capabilities need explicit tests.
AWS SDK dependencies belong here, not in @buckiedb/core.
