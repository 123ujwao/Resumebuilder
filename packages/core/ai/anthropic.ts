import type {
  AiResult,
  AnthropicClient,
  Message,
  SendOptions,
} from './types.js';

/**
 * `fetch`-based Anthropic Messages API client (BYOK).
 *
 * This wrapper calls `api.anthropic.com` directly from the browser using the
 * user's own key. The key is passed in by the caller (read from `localStorage`)
 * and is only ever sent to Anthropic — never persisted or transmitted elsewhere
 * (Req 1.2). All failures are mapped to a typed {@link AiResult} (Req 1.6).
 */

/** Anthropic Messages API endpoint. The key is only ever sent here (Req 1.2). */
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/** Pinned Anthropic API version header value. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** Default model used when none is supplied. */
export const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';

/** Default max tokens per request. */
export const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicClientConfig {
  /** The user's Anthropic API key (from `localStorage`). May be empty/undefined. */
  apiKey?: string | null;
  /** Model id. Defaults to {@link DEFAULT_MODEL}. */
  model?: string;
  /**
   * `fetch` implementation. Defaults to the global `fetch`. Injectable so tests
   * can supply a mock without touching the network.
   */
  fetchImpl?: typeof fetch;
}

/**
 * The relevant subset of the Anthropic Messages API success response.
 * The API returns `content` as an array of blocks; we only read text blocks.
 */
interface AnthropicMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
}

function ok<T>(value: T): AiResult<T> {
  return { ok: true, value };
}

function fail<T = never>(
  error: Exclude<AiResult<T>, { ok: true }>['error'],
  message: string,
): AiResult<T> {
  return { ok: false, error, message };
}

/**
 * Create an {@link AnthropicClient} bound to a specific key + config.
 *
 * The returned `send` never throws for expected failure modes; it resolves to a
 * typed {@link AiResult} so the UI can render actionable messages.
 */
export function createAnthropicClient(
  config: AnthropicClientConfig = {},
): AnthropicClient {
  const model = config.model ?? DEFAULT_MODEL;
  const doFetch = config.fetchImpl ?? globalThis.fetch;

  return {
    async send(
      messages: Message[],
      system: string,
      opts: SendOptions = {},
    ): Promise<AiResult<string>> {
      const apiKey = config.apiKey?.trim();

      // Req 1.5: block AI actions when no key is stored instead of failing silently.
      if (!apiKey) {
        return fail(
          'no_key',
          'No Anthropic API key found. Add your key to use AI features.',
        );
      }

      if (typeof doFetch !== 'function') {
        return fail(
          'network',
          'No fetch implementation available in this environment.',
        );
      }

      const body = JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      let response: Response;
      try {
        response = await doFetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // Req 1.2: BYOK — the user's key is sent only to Anthropic.
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            // Required for direct browser-to-Anthropic calls (CORS).
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body,
        });
      } catch {
        // fetch itself rejected (offline, DNS, CORS preflight failure, abort).
        return fail(
          'network',
          'Could not reach the Anthropic API. Check your connection and try again.',
        );
      }

      // Map HTTP status codes to typed errors (Req 1.6).
      if (!response.ok) {
        return mapHttpError(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return fail(
          'parse',
          'The Anthropic API returned a response that could not be read.',
        );
      }

      const text = extractText(payload);
      if (text === null) {
        return fail(
          'parse',
          'The Anthropic API response did not contain any text content.',
        );
      }

      return ok(text);
    },
  };
}

/** Map a non-2xx HTTP status to a typed AI error (Req 1.6). */
function mapHttpError(status: number): AiResult<string> {
  if (status === 401 || status === 403) {
    return fail(
      'auth',
      'Your Anthropic API key was rejected. Check the key and try again.',
    );
  }
  if (status === 429) {
    return fail(
      'rate_limit',
      'Anthropic is rate-limiting requests. Wait a moment and try again.',
    );
  }
  return fail(
    'network',
    `The Anthropic API returned an unexpected error (HTTP ${status}).`,
  );
}

/**
 * Pull the concatenated text out of a Messages API response.
 * Returns `null` when the shape is unexpected or contains no text blocks.
 */
function extractText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const content = (payload as AnthropicMessagesResponse).content;
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter(
      (block): block is { type?: string; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('');

  return text.length > 0 ? text : null;
}
