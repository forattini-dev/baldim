import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchFallback, createHttpClient, createHttpClientSync } from '../src/http-client.js';

describe('HTTP client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds URLs, authentication headers, and JSON bodies with fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 201 }));
    const client = await createHttpClient({
      baseUrl: 'https://example.test/v1/',
      auth: { type: 'bearer', token: 'secret' },
      headers: { 'X-Default': 'yes' }
    });

    const response = await client.post('records', { json: { name: 'Baldim' } });

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/v1/records', expect.objectContaining({
      method: 'POST',
      body: '{"name":"Baldim"}',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
        'User-Agent': 'baldim-http-client',
        'X-Default': 'yes'
      })
    }));
  });

  it('retries configured status codes and returns the successful response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const client = new FetchFallback({
      retry: { maxAttempts: 1, delay: 0, jitter: false }
    });

    const response = await client.get('https://example.test/health');

    expect(await response.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates the same provider-neutral fetch implementation synchronously', () => {
    expect(createHttpClientSync()).toBeInstanceOf(FetchFallback);
  });
});
