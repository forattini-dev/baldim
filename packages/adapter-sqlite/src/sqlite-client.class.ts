import { mapStorageError, DatabaseError, BaseError } from '@baldin/core/adapter';
import type {
  StoragePutObjectParams,
  StorageCopyObjectParams,
  StoragePutObjectResponse,
  StorageObject,
  StorageCopyObjectResponse,
  StorageDeleteObjectResponse,
  StorageDeleteObjectsResponse,
  StorageListObjectsParams,
  StorageListObjectsResponse,
  QueueStats
} from '@baldin/core/adapter';
import type { CommandInput, Command } from './sqlite/types.js';
import { SqliteClientVec } from './sqlite/vec.js';

export class SqliteClient extends SqliteClientVec {
  getAggregateMetrics(since: number = 0): unknown | null {
    if (this.taskManager && typeof this.taskManager.getAggregateMetrics === 'function') {
      return this.taskManager.getAggregateMetrics(since);
    }
    return null;
  }

  async sendCommand(command: Command): Promise<unknown> {
    const commandName = command?.constructor?.name || command?.name || 'UnknownCommand';
    const input = command?.input || {};

    this.emit('cl:request', commandName, input);
    this.emit('command.request', commandName, input);

    let response: unknown;

    try {
      switch (commandName) {
        case 'PutObjectCommand':
          response = await this._handlePutObject(input);
          break;
        case 'GetObjectCommand':
          response = await this._handleGetObject(input);
          break;
        case 'HeadObjectCommand':
          response = await this._handleHeadObject(input);
          break;
        case 'CopyObjectCommand':
          response = await this._handleCopyObject(input);
          break;
        case 'DeleteObjectCommand':
          response = await this._handleDeleteObject(input);
          break;
        case 'DeleteObjectsCommand':
          response = await this._handleDeleteObjects(input);
          break;
        case 'ListObjectsV2Command':
          response = await this._handleListObjects(input);
          break;
        default:
          throw new DatabaseError(`Unsupported command: ${commandName}`, {
            operation: 'sendCommand',
            statusCode: 400,
            retriable: false,
            suggestion: 'Use one of the supported commands: PutObject, GetObject, HeadObject, CopyObject, DeleteObject, DeleteObjects, or ListObjectsV2.'
          });
      }

      this.emit('command.response', commandName, response, input);
      return response;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      const mappedError = mapStorageError(error as Error, {
        bucket: this.bucket,
        key: input.Key,
        commandName,
        commandInput: input
      });
      throw mappedError;
    }
  }

  private async _handlePutObject(input: CommandInput): Promise<StoragePutObjectResponse> {
    return this.putObject({
      key: input.Key ?? '',
      metadata: input.Metadata,
      contentType: input.ContentType,
      body: input.Body as StoragePutObjectParams['body'],
      contentEncoding: input.ContentEncoding,
      contentLength: input.ContentLength,
      ifMatch: input.IfMatch,
      ifNoneMatch: input.IfNoneMatch
    });
  }

  private async _handleGetObject(input: CommandInput): Promise<StorageObject> {
    return this.getObject(input.Key || '');
  }

  private async _handleHeadObject(input: CommandInput): Promise<StorageObject> {
    return this.headObject(input.Key || '');
  }

  private async _handleCopyObject(input: CommandInput): Promise<StorageCopyObjectResponse> {
    const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);

    if (sourceBucket && sourceBucket !== this.bucket) {
      throw new DatabaseError(`Cross-bucket copy is not supported in SqliteClient (requested ${sourceBucket} → ${this.bucket})`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Instantiate a SqliteClient with the requested destination bucket or copy within the same bucket.'
      });
    }

    return this.copyObject({
      from: sourceKey,
      to: input.Key || '',
      metadata: input.Metadata,
      metadataDirective: input.MetadataDirective,
      contentType: input.ContentType
    });
  }

  private async _handleDeleteObject(input: CommandInput): Promise<StorageDeleteObjectResponse> {
    return this.deleteObject(input.Key || '');
  }

  private async _handleDeleteObjects(input: CommandInput): Promise<StorageDeleteObjectsResponse> {
    const objects = input.Delete?.Objects || [];
    const keys = objects.map(obj => obj.Key);
    return this.deleteObjects(keys);
  }

  private async _handleListObjects(input: CommandInput): Promise<StorageListObjectsResponse> {
    return this.listObjects({
      prefix: input.Prefix || '',
      delimiter: input.Delimiter,
      maxKeys: input.MaxKeys,
      continuationToken: input.ContinuationToken,
      startAfter: input.StartAfter ? this._applyKeyPrefix(input.StartAfter) : null
    });
  }
}

export default SqliteClient;
