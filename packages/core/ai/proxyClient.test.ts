import { describe, it, expect, vi } from 'vitest';
import { PROXY_DEFAULT_MAX_TOKENS, createProxyClient } from './proxyClient.js';
import type { Message } from './types.js';

/** Build a Response-like object accepted by the client (only needs ok/status/json). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ENDPOINT = 'https://example.functions.supabase.co/functions/v1/ai-proxy';
const messages: Message[] = [{ role: 'user', content: 'Hello' }];

describe('createProxyClient error mapping', () => {
  it('maps HTTP 401 to auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, {}));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('auth');
  });

  it('maps HTTP 403 to auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, {}));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('auth');
  });

  it('maps HTTP 429 to rate_limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('rate_limit');
  });

  it('maps other non-2xx statuses to network', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network');
  });

  it('maps a rejected fetch (offline/CORS) to network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network');
  });

  it('maps invalid JSON body to parse', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token');
          },
        }) as unknown as Response,
    );
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('maps a response with empty text to parse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { text: '' }));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('maps a response with missing text to parse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('maps a malformed (non-object) body to parse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, 'not-an-object'));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });
});

describe('createProxyClient success path', () => {
  it('returns the text on a valid response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { text: 'Hello world' }),
    );
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result).toEqual({ ok: true, value: 'Hello world' });
  });

  it('POSTs to the configured endpoint with the expected body + headers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { text: 'ok' }));
    const client = createProxyClient({
      endpoint: ENDPOINT,
      headers: { Authorization: 'Bearer anon', apikey: 'anon' },
      fetchImpl,
    });

    await client.send(messages, 'my-system', { maxTokens: 100 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer anon');
    expect(headers['apikey']).toBe('anon');

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.system).toBe('my-system');
    expect(sentBody.maxTokens).toBe(100);
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('defaults maxTokens when not provided', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { text: 'ok' }));
    const client = createProxyClient({ endpoint: ENDPOINT, fetchImpl });

    await client.send(messages, 'sys');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.maxTokens).toBe(PROXY_DEFAULT_MAX_TOKENS);
  });
});
