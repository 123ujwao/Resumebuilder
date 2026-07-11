/**
 * Shared types for the ResumeForge AI layer.
 *
 * The AI layer is a thin wrapper over the Anthropic Messages API called
 * directly from the browser with the user's own key (BYOK). Errors are mapped
 * to a typed {@link AiResult} so the UI can show clear, actionable messages
 * instead of leaking raw fetch/HTTP failures (Req 1.6).
 */

/** A single chat message sent to the Anthropic Messages API. */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Discriminated result of an AI call.
 *
 * `error` values map to distinct failure modes the UI handles differently:
 * - `no_key`     : no API key was provided (Req 1.5) — prompt for a key.
 * - `auth`       : Anthropic rejected the key (HTTP 401/403) (Req 1.6).
 * - `rate_limit` : Anthropic rate-limited the request (HTTP 429) (Req 1.6).
 * - `parse`      : the response body could not be parsed into the expected shape.
 * - `network`    : the request never completed, or an unexpected HTTP error.
 */
export type AiErrorKind = 'no_key' | 'auth' | 'rate_limit' | 'parse' | 'network';

export type AiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AiErrorKind; message: string };

/** Options accepted per AI request. */
export interface SendOptions {
  /** Max tokens to generate. Defaults to {@link DEFAULT_MAX_TOKENS}. */
  maxTokens?: number;
}

/**
 * Thin client over the Anthropic Messages API.
 *
 * `send` never throws for expected failure modes; it resolves to an
 * {@link AiResult} so callers branch on a typed error instead of catching.
 */
export interface AnthropicClient {
  send(
    messages: Message[],
    system: string,
    opts?: SendOptions,
  ): Promise<AiResult<string>>;
}
