import BaseBackupDriver, {
  type BackupDriverConfig,
  type BackupManifest,
  type BackupMetadata,
  type UploadResult,
  type ListOptions,
  type BackupListItem,
  type StorageInfo
} from './base-backup-driver.class.js';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { tryFn } from '@baldim/core/plugin';
import { BackupError } from '../errors.js';

export interface ObjectStoragePutInput {
  key: string;
  body?: Buffer | string | Readable;
  contentLength?: number;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export interface ObjectStorageClient {
  putObject?(input: ObjectStoragePutInput): Promise<unknown>;
  getObject?(key: string): Promise<unknown>;
  headObject?(key: string): Promise<unknown>;
  deleteObject?(key: string): Promise<unknown>;
  listObjects?(input: { prefix?: string; maxKeys?: number }): Promise<unknown>;

  // Compatibility with standalone object-storage clients.
  uploadObject?(input: Record<string, unknown>): Promise<unknown>;
  downloadObject?(input: Record<string, unknown>): Promise<unknown>;
  getObjectStream?(input: Record<string, unknown>): Promise<AsyncIterable<Uint8Array>>;
  config?: { bucket?: string };
}

export interface S3BackupDriverConfig extends BackupDriverConfig {
  bucket?: string | null;
  path?: string;
  storageClass?: string;
  serverSideEncryption?: string;
  client?: ObjectStorageClient | null;
}

interface S3ListObject {
  Key: string;
  Size?: number;
  LastModified?: string | Date;
  StorageClass?: string;
}

interface S3ListResponse {
  Contents?: S3ListObject[];
}

async function bodyToBuffer(value: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);

  const response = value as {
    Body?: unknown;
    transformToByteArray?(): Promise<Uint8Array>;
    transformToString?(): Promise<string>;
    [Symbol.asyncIterator]?(): AsyncIterator<Uint8Array>;
  } | null;
  if (!response) throw new Error('Object storage returned an empty body');

  const body = response.Body ?? response;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);

  const transformable = body as {
    transformToByteArray?(): Promise<Uint8Array>;
    transformToString?(): Promise<string>;
    [Symbol.asyncIterator]?(): AsyncIterator<Uint8Array>;
  };
  if (typeof transformable.transformToByteArray === 'function') {
    return Buffer.from(await transformable.transformToByteArray());
  }
  if (typeof transformable.transformToString === 'function') {
    return Buffer.from(await transformable.transformToString());
  }
  if (typeof transformable[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of transformable as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Object storage response body is not readable');
}

export default class S3BackupDriver extends BaseBackupDriver {
  declare config: S3BackupDriverConfig;

  constructor(config: S3BackupDriverConfig = {}) {
    super({
      bucket: null,
      path: 'backups/{date}/',
      storageClass: 'STANDARD_IA',
      serverSideEncryption: 'AES256',
      client: null,
      ...config
    });
  }

  override getType(): string {
    return 's3';
  }

  private get client(): ObjectStorageClient {
    if (!this.config.client) {
      throw new BackupError('S3BackupDriver: client is required', {
        operation: 'client',
        driver: 's3'
      });
    }
    return this.config.client;
  }

  override async onSetup(): Promise<void> {
    if (!this.config.client) {
      this.config.client = (this.database as unknown as { client?: ObjectStorageClient }).client || null;
    }
    this.config.bucket ||= this.config.client?.config?.bucket || null;

    if (!this.config.client) {
      throw new BackupError('S3BackupDriver: client is required', {
        operation: 'onSetup',
        driver: 's3',
        suggestion: 'Provide an object-storage client or install the plugin on a database backed by @baldim/adapter-s3'
      });
    }
    if (!this.client.putObject && !this.client.uploadObject) {
      throw new BackupError('S3BackupDriver: client does not implement putObject()', {
        operation: 'onSetup',
        driver: 's3'
      });
    }
  }

  resolveKey(backupId: string, manifest: BackupManifest = {}): string {
    const now = new Date();
    return path.posix.join(
      (this.config.path as string)
        .replace('{date}', now.toISOString().slice(0, 10))
        .replace('{time}', now.toISOString().slice(11, 19).replace(/:/g, '-'))
        .replace('{year}', now.getFullYear().toString())
        .replace('{month}', (now.getMonth() + 1).toString().padStart(2, '0'))
        .replace('{day}', now.getDate().toString().padStart(2, '0'))
        .replace('{backupId}', backupId)
        .replace('{type}', manifest.type || 'backup'),
      `${backupId}.backup`
    );
  }

  resolveManifestKey(backupId: string, manifest: BackupManifest = {}): string {
    return this.resolveKey(backupId, manifest).replace(/\.backup$/, '.manifest.json');
  }

  private async put(key: string, body: Buffer | string | Readable, options: {
    contentLength?: number;
    contentType?: string;
    metadata?: Record<string, unknown>;
  } = {}): Promise<unknown> {
    if (this.client.putObject) {
      return this.client.putObject({ key, body, ...options });
    }
    return this.client.uploadObject!({
      bucket: this.config.bucket,
      key,
      body,
      ...options,
      storageClass: this.config.storageClass,
      serverSideEncryption: this.config.serverSideEncryption
    });
  }

  private async get(key: string): Promise<Buffer> {
    if (this.client.getObject) return bodyToBuffer(await this.client.getObject(key));
    if (this.client.getObjectStream) {
      return bodyToBuffer(await this.client.getObjectStream({
        bucket: this.config.bucket,
        key
      }));
    }
    throw new Error('Object-storage client does not implement getObject()');
  }

  private async remove(key: string): Promise<void> {
    if (!this.client.deleteObject) throw new Error('Object-storage client does not implement deleteObject()');
    if (this.client.putObject) await this.client.deleteObject(key);
    else await this.client.deleteObject({ bucket: this.config.bucket, key } as never);
  }

  override async upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<UploadResult> {
    const backupKey = this.resolveKey(backupId, manifest);
    const manifestKey = this.resolveManifestKey(backupId, manifest);
    const stats = await stat(filePath);
    const [uploadOk, uploadErr, uploadResult] = await tryFn(() =>
      this.put(backupKey, createReadStream(filePath), {
        contentLength: stats.size,
        metadata: {
          'backup-id': backupId,
          'backup-type': manifest.type || 'backup',
          'created-at': new Date().toISOString()
        }
      })
    );
    if (!uploadOk) {
      throw new BackupError('Failed to upload backup file to S3', {
        operation: 'upload', driver: 's3', backupId, key: backupKey, original: uploadErr
      });
    }

    const persistedManifest = { ...manifest, createdAt: manifest.createdAt || new Date().toISOString() };
    const [manifestOk, manifestErr] = await tryFn(() =>
      this.put(manifestKey, JSON.stringify(persistedManifest, null, 2), {
        contentType: 'application/json',
        metadata: { 'backup-id': backupId, 'manifest-for': backupKey }
      })
    );
    if (!manifestOk) {
      await tryFn(() => this.remove(backupKey));
      throw new BackupError('Failed to upload manifest to S3', {
        operation: 'upload', driver: 's3', backupId, key: manifestKey, original: manifestErr
      });
    }

    return {
      bucket: this.config.bucket || undefined,
      key: backupKey,
      manifestKey,
      size: stats.size,
      storageClass: this.config.storageClass,
      uploadedAt: new Date().toISOString(),
      etag: (uploadResult as { ETag?: string })?.ETag
    };
  }

  override async download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string> {
    const key = metadata.key || this.resolveKey(backupId, metadata as BackupManifest);
    await mkdir(path.dirname(targetPath), { recursive: true });
    if (this.client.downloadObject && !this.client.getObject) {
      await this.client.downloadObject({ bucket: this.config.bucket, key, filePath: targetPath });
    } else {
      await writeFile(targetPath, await this.get(key));
    }
    return targetPath;
  }

  override async delete(backupId: string, metadata: BackupMetadata): Promise<void> {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata as BackupManifest);
    const manifestKey = metadata.manifestKey || this.resolveManifestKey(backupId, metadata as BackupManifest);
    const results = await Promise.allSettled([this.remove(backupKey), this.remove(manifestKey)]);
    if (results.every(result => result.status === 'rejected')) {
      throw new BackupError('Failed to delete backup from S3', {
        operation: 'delete', driver: 's3', backupId, backupKey, manifestKey
      });
    }
  }

  override async list(options: ListOptions = {}): Promise<BackupListItem[]> {
    if (!this.client.listObjects) return [];
    const searchPrefix = (this.config.path as string).replace(/\{[^}]+\}/g, '');
    const response = await this.client.listObjects({
      prefix: searchPrefix,
      maxKeys: (options.limit || 50) * 2
    }) as S3ListResponse;
    const manifests = (response.Contents || [])
      .filter(item => item.Key.endsWith('.manifest.json'))
      .filter(item => !options.prefix || item.Key.includes(options.prefix))
      .slice(0, options.limit || 50);

    const results: BackupListItem[] = [];
    for (const item of manifests) {
      try {
        const manifest = JSON.parse((await this.get(item.Key)).toString('utf8')) as BackupManifest;
        results.push({
          id: path.posix.basename(item.Key, '.manifest.json'),
          bucket: this.config.bucket || undefined,
          key: item.Key.replace(/\.manifest\.json$/, '.backup'),
          manifestKey: item.Key,
          size: item.Size,
          lastModified: item.LastModified instanceof Date ? item.LastModified.toISOString() : item.LastModified,
          storageClass: item.StorageClass,
          createdAt: manifest.createdAt || (item.LastModified instanceof Date ? item.LastModified.toISOString() : item.LastModified),
          ...manifest
        });
      } catch (error) {
        this.log(`Failed to read manifest ${item.Key}: ${(error as Error).message}`);
      }
    }
    return results.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  override async verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean> {
    const key = metadata.key || this.resolveKey(backupId, metadata as BackupManifest);
    const [ok, , body] = await tryFn(() => this.get(key));
    if (!ok) return false;
    return crypto.createHash('sha256').update(body!).digest('hex') === expectedChecksum;
  }

  override getStorageInfo(): StorageInfo {
    const config = {
      bucket: this.config.bucket,
      path: this.config.path,
      storageClass: this.config.storageClass,
      serverSideEncryption: this.config.serverSideEncryption,
      compression: this.config.compression,
      encryption: this.config.encryption ? { algorithm: this.config.encryption.algorithm } : null
    };
    return {
      type: this.getType(),
      config,
      ...config
    };
  }
}
