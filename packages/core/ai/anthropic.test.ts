import { describe, it, expect, vi } from 'vitest';
import {
  ANTHROPIC_API_URL,
  ANTHROPIC_VERSION,
  DEFAULT_MAX_TOKENS,
  createAnthropicClient,
} from './anthropic.js';
import type { Message } from './types.js';

/** Build a Response-like object accepted by the client (only needs ok/status/json). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const messages: Message[] = [{ role: 'user', content: 'Hello' }];

describe('createAnthropicClient error mapping', () => {
  it('returns no_key when the key is missing', async () => {
    const fetchImpl = vi.fn();
    const client = createAnthropicClient({ apiKey: undefined, fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result).toEqual({
      ok: false,
      error: 'no_key',
      message: expect.any(String),
    });
    // Must not attempt any network call when there is no key.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns no_key when the key is blank/whitespace', async () => {
    const fetchImpl = vi.fn();
    const client = createAnthropicClient({ apiKey: '   ', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps HTTP 401 to auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, {}));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('auth');
  });

  it('maps HTTP 403 to auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, {}));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('auth');
  });

  it('maps HTTP 429 to rate_limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('rate_limit');
  });

  it('maps other non-2xx statuses to network', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network');
  });

  it('maps a rejected fetch (offline/CORS) to network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

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
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('maps a response with no text content to parse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { content: [] }));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });

  it('maps a malformed (non-object) body to parse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, 'not-an-object'));
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('parse');
  });
});

describe('createAnthropicClient success path', () => {
  it('returns concatenated text on a valid response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      }),
    );
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    const result = await client.send(messages, 'sys');

    expect(result).toEqual({ ok: true, value: 'Hello world' });
  });

  it('sends the required Anthropic headers and only calls api.anthropic.com', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: 'text', text: 'ok' }] }),
    );
    const client = createAnthropicClient({ apiKey: 'sk-secret', fetchImpl });

    await client.send(messages, 'my-system', { maxTokens: 100 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_API_URL);
    expect(url).toContain('api.anthropic.com');

    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-secret');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.system).toBe('my-system');
    expect(sentBody.max_tokens).toBe(100);
    expect(sentBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('defaults max_tokens when not provided', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: 'text', text: 'ok' }] }),
    );
    const client = createAnthropicClient({ apiKey: 'sk-test', fetchImpl });

    await client.send(messages, 'sys');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.max_tokens).toBe(DEFAULT_MAX_TOKENS);
  });
});
