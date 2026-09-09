/**
 * Reads Baldim's canonical environment variable and falls back to the s3db.js
 * spelling so existing deployments keep their operational configuration.
 */
export function getBaldimEnvironment(suffix: string): string | undefined {
  return process.env[`BALDIM_${suffix}`] ?? process.env[`S3DB_${suffix}`];
}
