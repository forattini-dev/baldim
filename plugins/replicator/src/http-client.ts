export interface HttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  auth?: AuthConfig;
  retry?: RetryConfig;
}

export type AuthConfig =
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apikey'; header?: string; value: string };

export interface RetryConfig {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'fixed' | 'exponential';
  jitter?: boolean;
  retryAfter?: boolean;
  retryOn?: number[];
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  json?: unknown;
  timeout?: number;
}

export interface HttpClient {
  request(url: string, options?: RequestOptions): Promise<Response>;
  get(url: string, options?: RequestOptions): Promise<Response>;
  post(url: string, options?: RequestOptions): Promise<Response>;
  put(url: string, options?: RequestOptions): Promise<Response>;
  patch(url: string, options?: RequestOptions): Promise<Response>;
  delete(url: string, options?: RequestOptions): Promise<Response>;
}

export class FetchHttpClient implements HttpClient {
  constructor(private readonly options: HttpClientOptions = {}) {}

  async request(url: string, options: RequestOptions = {}): Promise<Response> {
    const body = options.json ?? options.body;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'baldim-replicator',
      ...this.options.headers,
      ...options.headers,
    };
    if (this.options.auth?.type === 'bearer') headers.authorization = `Bearer ${this.options.auth.token}`;
    if (this.options.auth?.type === 'basic') {
      headers.authorization = `Basic ${Buffer.from(`${this.options.auth.username}:${this.options.auth.password}`).toString('base64')}`;
    }
    if (this.options.auth?.type === 'apikey') headers[this.options.auth.header ?? 'x-api-key'] = this.options.auth.value;

    const retry = this.options.retry ?? {};
    const maxAttempts = Math.max(1, retry.maxAttempts ?? 1);
    const retryOn = retry.retryOn ?? [429, 500, 502, 503, 504];
    let response: Response | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      response = await fetch(new URL(url, this.options.baseUrl || undefined), {
        method: options.method ?? 'GET',
        headers,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeout ?? this.options.timeout ?? 30_000),
      });
      if (!retryOn.includes(response.status) || attempt === maxAttempts - 1) return response;
      const baseDelay = retry.delay ?? 1_000;
      const delay = retry.backoff === 'fixed' ? baseDelay : baseDelay * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, retry.jitter ? delay * (0.5 + Math.random()) : delay));
    }
    return response!;
  }

  get(url: string, options: RequestOptions = {}): Promise<Response> { return this.request(url, { ...options, method: 'GET' }); }
  post(url: string, options: RequestOptions = {}): Promise<Response> { return this.request(url, { ...options, method: 'POST' }); }
  put(url: string, options: RequestOptions = {}): Promise<Response> { return this.request(url, { ...options, method: 'PUT' }); }
  patch(url: string, options: RequestOptions = {}): Promise<Response> { return this.request(url, { ...options, method: 'PATCH' }); }
  delete(url: string, options: RequestOptions = {}): Promise<Response> { return this.request(url, { ...options, method: 'DELETE' }); }
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  return new FetchHttpClient(options);
}
