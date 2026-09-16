---
'@baldim/core': minor
'@baldim/adapter-s3': minor
---

Add optional `serverSideEncryption` (`'AES256' | 'aws:kms'`) to `StoragePutObjectParams`. The S3 adapter forwards it as `ServerSideEncryption` on `PutObjectCommand`, restoring at-rest encryption requests without per-project middleware workarounds; writes without the param are unchanged.
