import { PluginError } from '@baldim/core/plugin';

export interface QueueErrorDetails {
  queueName?: string;
  operation?: string;
  statusCode?: number;
  retriable?: boolean;
  suggestion?: string;
  messageId?: string;
  [key: string]: unknown;
}

export class QueueError extends PluginError {
  constructor(message: string, details: QueueErrorDetails = {}) {
    super(message, {
      pluginName: 'QueueConsumerPlugin',
      statusCode: details.statusCode ?? 400,
      retriable: details.retriable ?? false,
      ...details,
    });
  }
}
