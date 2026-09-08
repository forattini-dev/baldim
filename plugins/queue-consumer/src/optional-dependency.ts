import { PluginError } from '@baldin/core/plugin';

const installNames: Record<string, string> = {
  '@aws-sdk/client-sqs': '@aws-sdk/client-sqs',
  amqplib: 'amqplib',
  bullmq: 'bullmq',
  ioredis: 'ioredis',
};

export async function loadOptionalDependency(packageName: string, feature: string): Promise<unknown> {
  try {
    return await import(packageName);
  } catch (cause) {
    throw new PluginError(`${feature} requires the optional dependency ${packageName}`, {
      pluginName: 'QueueConsumerPlugin',
      operation: `${feature}.start`,
      statusCode: 500,
      retriable: false,
      suggestion: `Install ${installNames[packageName] ?? packageName} in the application that uses this queue driver.`,
      original: cause,
    });
  }
}
