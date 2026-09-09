import type { S3Client } from '@baldim/adapter-s3';
import type { ObjectStorageClient } from '../src/index.js';

declare const client: S3Client;
const contract: ObjectStorageClient = client;
void contract;
