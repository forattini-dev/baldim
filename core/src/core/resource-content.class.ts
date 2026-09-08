import { tryFn } from '../concerns/try-fn.js';
import { isNotFoundError } from '../concerns/storage-errors.js';
import { mapStorageError, ResourceError } from '../errors.js';
import type { StringRecord } from '../types/common.types.js';

export interface StorageResponse {
  Body?: {
    transformToByteArray(): Promise<Uint8Array>;
  };
  ContentType?: string;
  ContentLength?: number;
  Metadata?: StringRecord<string>;
}

export interface StorageClient {
  putObject(params: {
    key: string;
    metadata: StringRecord<string>;
    body: Buffer | string;
    contentType?: string;
  }): Promise<void>;
  getObject(key: string): Promise<StorageResponse>;
  headObject(key: string): Promise<StorageResponse>;
}

export interface SchemaMapper {
  mapper(data: StringRecord): Promise<StringRecord<string>>;
}

export interface Resource {
  name: string;
  client: StorageClient;
  schema: SchemaMapper;
  getResourceKey(id: string): string;
  get(id: string): Promise<StringRecord>;
  _emitStandardized(event: string, payload: unknown, id?: string): void;
}

export interface SetContentParams {
  id: string;
  buffer: Buffer | string;
  contentType?: string;
}

export interface ContentResult {
  buffer: Buffer | null;
  contentType: string | null;
}

export interface StorageOperationError extends Error {
  name: string;
  code?: string;
  Code?: string;
  statusCode?: number;
}

export class ResourceContent {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  private get client(): StorageClient {
    return this.resource.client;
  }

  async setContent({ id, buffer, contentType = 'application/octet-stream' }: SetContentParams): Promise<StringRecord> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, currentData] = await tryFn(() => this.resource.get(id));
    if (!ok || !currentData) {
      if (err && !isNotFoundError(err)) {
        throw mapStorageError(err as Error, {
          resourceName: this.resource.name,
          operation: 'setContent',
          id,
          key
        });
      }

      throw new ResourceError(`Resource with id '${id}' not found`, {
        resourceName: this.resource.name,
        id,
        operation: 'setContent'
      });
    }

    const bufferLength = typeof buffer === 'string' ? buffer.length : buffer.length;
    const updatedData: StringRecord = {
      ...currentData,
      _hasContent: true,
      _contentLength: bufferLength,
      _mimeType: contentType
    };

    const mappedMetadata = await this.resource.schema.mapper(updatedData);

    const [ok2, err2] = await tryFn(() => this.client.putObject({
      key,
      metadata: mappedMetadata,
      body: buffer,
      contentType
    }));

    if (!ok2) {
      throw mapStorageError(err2 as Error, {
        resourceName: this.resource.name,
        operation: 'setContent',
        id,
        key
      });
    }

    this.resource._emitStandardized('content-set', { id, contentType, contentLength: bufferLength }, id);
    return updatedData;
  }

  async content(id: string): Promise<ContentResult> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      const error = err as StorageOperationError;
      if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey' || error.Code === 'NoSuchKey' || error.statusCode === 404) {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw mapStorageError(error, {
        resourceName: this.resource.name,
        operation: 'content',
        id,
        key
      });
    }

    const storageResponse = response as StorageResponse;
    const buffer = Buffer.from(await storageResponse.Body!.transformToByteArray());
    const contentType = storageResponse.ContentType || null;

    this.resource._emitStandardized('content-fetched', { id, contentLength: buffer.length, contentType }, id);

    return {
      buffer,
      contentType
    };
  }

  async hasContent(id: string): Promise<boolean> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, response] = await tryFn(() => this.client.headObject(key));
    if (!ok) {
      if (isNotFoundError(err)) {
        return false;
      }
      throw mapStorageError(err as Error, {
        resourceName: this.resource.name,
        operation: 'hasContent',
        id,
        key
      });
    }
    const storageResponse = response as StorageResponse;
    return (storageResponse.ContentLength || 0) > 0;
  }

  async deleteContent(id: string): Promise<void> {
    const key = this.resource.getResourceKey(id);
    const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
    if (!ok) {
      throw mapStorageError(err as Error, {
        resourceName: this.resource.name,
        operation: 'deleteContent',
        id,
        key
      });
    }

    const storageResponse = existingObject as StorageResponse;
    const existingMetadata = storageResponse.Metadata || {};

    const [ok2, err2] = await tryFn(() => this.client.putObject({
      key,
      body: '',
      metadata: existingMetadata,
    }));

    if (!ok2) {
      throw mapStorageError(err2 as Error, {
        resourceName: this.resource.name,
        operation: 'deleteContent',
        id,
        key
      });
    }

    this.resource._emitStandardized('content-deleted', id, id);
  }
}

export default ResourceContent;
