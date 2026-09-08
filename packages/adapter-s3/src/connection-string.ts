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


export function resolveLegacyS3ConnectionString(
  options: Readonly<Record<string, unknown>>
): string | undefined {
  const bucket = typeof options.bucket === 'string' ? options.bucket : undefined;
  const region = typeof options.region === 'string' ? options.region : undefined;
  const accessKeyId = typeof options.accessKeyId === 'string' ? options.accessKeyId : undefined;
  const secretAccessKey = typeof options.secretAccessKey === 'string' ? options.secretAccessKey : undefined;
  const sessionToken = typeof options.sessionToken === 'string' ? options.sessionToken : undefined;
  const endpoint = typeof options.endpoint === 'string' ? options.endpoint : undefined;
  const forcePathStyle = options.forcePathStyle === true;

  if (!bucket && !accessKeyId && !secretAccessKey) return undefined;

  if (endpoint) {
    const url = new URL(endpoint);
    if (accessKeyId) url.username = encodeURIComponent(accessKeyId);
    if (secretAccessKey) url.password = encodeURIComponent(secretAccessKey);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    url.pathname = `/${bucket || 's3db'}`;
    if (forcePathStyle) url.searchParams.set('forcePathStyle', 'true');
    return url.toString();
  }

  if (accessKeyId && secretAccessKey) {
    const params = new URLSearchParams();
    params.set('region', region || 'us-east-1');
    if (sessionToken) params.set('sessionToken', sessionToken);
    if (forcePathStyle) params.set('forcePathStyle', 'true');
    return `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || 's3db'}?${params.toString()}`;
  }

  return undefined;
}
