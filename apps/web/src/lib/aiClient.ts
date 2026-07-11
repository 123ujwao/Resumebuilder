import { createProxyClient, type AnthropicClient } from '@resume-forge/core';

/**
 * Web-app AI client that routes through the hosted `ai-proxy` Supabase Edge
 * Function (Req: no per-user BYOK, zero cost to the operator).
 *
 * Unlike the shared `createAnthropicClient` (still used by the Chrome extension
 * for its own BYOK flow), this client NEVER handles an API key. A single Google
 * Gemini free-tier key lives only as a server-side secret inside the edge
 * function. Here we only point the shared {@link createProxyClient} at the
 * function URL and attach the Supabase anon key so the gateway accepts the call
 * even for logged-out users.
 *
 * `getAiClient` returns the same typed {@link AnthropicClient} shape the core
 * client exposes, so the extraction / tailoring / cover-letter pipelines work
 * unchanged.
 */

/** Path of the `ai-proxy` function on the Supabase edge runtime. */
const FUNCTION_PATH = '/functions/v1/ai-proxy';

/** Resolve the proxy endpoint from env: explicit override or derived from Supabase URL. */
function resolveEndpoint(): string {
  const explicit = import.meta.env.VITE_AI_PROXY_URL;
  if (explicit) return explicit;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  return `${supabaseUrl}${FUNCTION_PATH}`;
}

/**
 * True when the hosted AI backend is configured — i.e. either an explicit proxy
 * URL or the Supabase URL is set. The app can still build/edit resumes without
 * it; only the AI features need it.
 */
export function isAiConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_AI_PROXY_URL || import.meta.env.VITE_SUPABASE_URL,
  );
}

/**
 * Returns the web app's proxy-backed AI client. Attaches the Supabase anon key
 * so the edge-function gateway accepts the request (works for logged-out users
 * too). No user API key is ever involved.
 */
export function getAiClient(): AnthropicClient {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  return createProxyClient({
    endpoint: resolveEndpoint(),
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });
}
