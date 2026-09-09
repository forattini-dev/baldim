import { PluginError } from '@baldim/core/plugin';

export interface QueueErrorDetails {
  queueName?: string;
  operation?: string;
  messageId?: string;
  description?: string;
  [key: string]: unknown;
}

export class QueueError extends PluginError {
  constructor(message: string, details: QueueErrorDetails = {}) {
    const { queueName, operation = 'unknown', messageId, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Queue Operation Error

Operation: ${operation}
${queueName ? `Queue: ${queueName}` : ''}
${messageId ? `Message ID: ${messageId}` : ''}

Common causes:
1. Queue not properly configured
2. Message handler not registered
3. Queue resource not found
4. Storage adapter operation failed
5. Message processing timeout

Solution:
Check queue configuration and message handler registration.

Docs: https://github.com/forattini-dev/baldim/tree/main/plugins/s3-queue
`.trim();
    }

    super(message, {
      pluginName: 'S3QueuePlugin',
      ...rest,
      queueName,
      operation,
      messageId,
      description,
    });
  }
}

export default QueueError;
