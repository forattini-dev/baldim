import { createRequire } from 'node:module';
import { ReplicationError } from './replicator.errors.js';

const require = createRequire(import.meta.url);

const packageNames: Record<string, string> = {
  'postgresql-replicator': 'pg',
  'bigquery-replicator': '@google-cloud/bigquery',
  'sqs-replicator': '@aws-sdk/client-sqs',
  'planetscale-replicator': '@planetscale/database',
  'turso-replicator': '@libsql/client',
};

const dependencyLoaders: Record<string, () => any> = {
  '@aws-sdk/client-dynamodb': () => require('@aws-sdk/client-dynamodb'),
  '@aws-sdk/lib-dynamodb': () => require('@aws-sdk/lib-dynamodb'),
  mongodb: () => require('mongodb'),
  mysql2: () => require('mysql2'),
};

export default function loadDependency(name: string, replicatorClass = 'Replicator'): any {
  const packageName = packageNames[name] ?? name;
  try {
    return dependencyLoaders[packageName]?.() ?? require(packageName);
  } catch (error) {
    throw new ReplicationError(`Failed to load bundled dependency ${packageName}`, {
      operation: 'loadDependency',
      replicatorClass,
      packageName,
      original: error,
      suggestion: `Reinstall @baldim/plugin-replicator to restore ${packageName}.`,
    });
  }
}
