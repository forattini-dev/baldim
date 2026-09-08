export interface S3ConnectionConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint: string;
  keyPrefix: string;
  forcePathStyle?: boolean;
  [key: string]: unknown;
}

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';

export function parseS3ConnectionString(connectionString: string): S3ConnectionConfig {
  const url = new URL(connectionString);
  const isS3 = url.protocol === 's3:';
  const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const bucket = isS3 ? decodeURIComponent(url.hostname || 's3db') : (path.shift() || 's3db');
  const region = url.searchParams.get('region') || DEFAULT_REGION;
  const endpoint = isS3 ? DEFAULT_ENDPOINT : url.origin;
  const forcePathStyle = url.searchParams.get('forcePathStyle') === 'true' || !isS3;
  return {
    region,
    bucket,
    accessKeyId: url.username ? decodeURIComponent(url.username) : undefined,
    secretAccessKey: url.password ? decodeURIComponent(url.password) : undefined,
    sessionToken: url.searchParams.get('sessionToken') || undefined,
    endpoint,
    keyPrefix: path.join('/'),
    forcePathStyle,
  };
}
