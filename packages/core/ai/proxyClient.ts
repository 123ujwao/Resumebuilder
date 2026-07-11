import type {
  AiResult,
  AnthropicClient,
  Message,
  SendOptions,
} from './types.js';

/**
 * `fetch`-based proxy client for the hosted AI backend.
 *
 * Unlike {@link createAnthropicClient} (direct browser-to-Anthropic BYOK), this
 * client talks ONLY to our own Supabase Edge Function (`ai-proxy`). The function
 * holds a single Google Gemini FREE-TIER key as a server-side secret and calls
 * Gemini on the caller's behalf, so end users never supply an API key and the
 * operator pays nothing.
 *
 * It implements the same {@link AnthropicClient} interface as the Anthropic
 * client so the extraction / tailoring / cover-letter pipelines work unchanged.
 * `send` never throws for expected failure modes; it resolves to a typed
 * {@link AiResult} so the UI can render actionable messages.
 */

/** Default max tokens per request (mirrors the Anthropic client default). */
export const PROXY_DEFAULT_MAX_TOKENS = 4096;

export interface ProxyClientConfig {
  /** Absolute URL of the `ai-proxy` edge function. */
  endpoint: string;
  /** Extra headers to send (e.g. the Supabase anon key / Authorization). */
  headers?: Record<string, string>;
  /**
   * `fetch` implementation. Defaults to the global `fetch`. Injectable so tests
   * can supply a mock without touching the network.
   */
  fetchImpl?: typeof fetch;
}

/** Shape of a successful `ai-proxy` response. */
interface ProxyResponse {
  text?: string;
}

function ok<T>(value: T): AiResult<T> {
  return { ok: true, value };
}

function fail(
  error: Exclude<AiResult<string>, { ok: true }>['error'],
  message: string,
): AiResult<string> {
  return { ok: false, error, message };
}

/**
 * Create an {@link AnthropicClient} that proxies through the hosted `ai-proxy`
 * edge function. The returned `send` never throws for expected failure modes.
 */
export function createProxyClient(config: ProxyClientConfig): AnthropicClient {
  const doFetch = config.fetchImpl ?? globalThis.fetch;

  return {
    async send(
      messages: Message[],
      system: string,
      opts: SendOptions = {},
    ): Promise<AiResult<string>> {
      if (typeof doFetch !== 'function') {
        return fail(
          'network',
          'No fetch implementation available in this environment.',
        );
      }

      const body = JSON.stringify({
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        maxTokens: opts.maxTokens ?? PROXY_DEFAULT_MAX_TOKENS,
      });

      let response: Response;
      try {
        response = await doFetch(config.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...config.headers,
          },
          body,
        });
      } catch {
        // fetch itself rejected (offline, DNS, CORS preflight failure, abort).
        return fail(
          'network',
          'Could not reach the AI service. Check your connection and try again.',
        );
      }

      // Map HTTP status codes to typed errors.
      if (!response.ok) {
        return mapHttpError(response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return fail(
          'parse',
          'The AI service returned a response that could not be read.',
        );
      }

      const text = extractText(payload);
      if (text === null) {
        return fail(
          'parse',
          'The AI response did not contain any text content.',
        );
      }

      return ok(text);
    },
  };
}

/** Map a non-2xx HTTP status to a typed AI error. */
function mapHttpError(status: number): AiResult<string> {
  if (status === 401 || status === 403) {
    return fail(
      'auth',
      'The AI service rejected the request. Please try again later.',
    );
  }
  if (status === 429) {
    return fail(
      'rate_limit',
      'The AI service is busy right now. Wait a moment and try again.',
    );
  }
  return fail(
    'network',
    `The AI service returned an unexpected error (HTTP ${status}).`,
  );
}

/**
 * Pull the text out of an `ai-proxy` response `{ text: string }`.
 * Returns `null` when the shape is unexpected or the text is empty.
 */
function extractText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const text = (payload as ProxyResponse).text;
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }
  return text;
}
