/**
 * Reads Baldin's canonical environment variable and falls back to the s3db.js
 * spelling so existing deployments keep their operational configuration.
 */
export function getBaldinEnvironment(suffix: string): string | undefined {
  return process.env[`BALDIN_${suffix}`] ?? process.env[`S3DB_${suffix}`];
}
