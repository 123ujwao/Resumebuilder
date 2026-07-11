// deno-lint-ignore-file no-explicit-any
/**
 * anthropic-proxy — Supabase Edge Function (Deno).
 *
 * PURPOSE
 * Routes all web-app AI calls through this server-side function so the app can
 * hold ONE Anthropic key as a secret. The key lives only in the function's
 * environment (`ANTHROPIC_API_KEY`, set via `supabase secrets set`). It is read
 * here, on the server, and used to call api.anthropic.com. The key is NEVER
 * sent to, or reachable from, the browser — the browser only ever talks to this
 * function using its Supabase session token.
 *
 * AUTH
 * Only signed-in users may spend Anthropic credits. Every request must carry a
 * valid `Authorization: Bearer <supabase access token>`; we verify it with
 * `supabase.auth.getUser()` and return 401 when there is no authenticated user.
 *
 * The upstream Anthropic status + body are passed straight back to the caller
 * (including 401/429/etc) so the web client can map them to typed errors.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** CORS headers applied to every response (including preflight). */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_MAX_TOKENS = 4096;

/** Build a JSON response with CORS headers attached. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

interface ProxyRequestBody {
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // --- Require an authenticated Supabase user -------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(
      { error: 'Server is misconfigured: Supabase env vars are missing.' },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json(
      { error: 'You must be signed in to use AI features.' },
      401,
    );
  }

  // --- Read the Anthropic key (server-side secret) --------------------------
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return json(
      {
        error:
          'The AI service is not configured. The ANTHROPIC_API_KEY secret is missing.',
      },
      500,
    );
  }

  // --- Parse the request body -----------------------------------------------
  let payload: ProxyRequestBody;
  try {
    payload = (await req.json()) as ProxyRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { system, messages, model, max_tokens } = payload;
  if (typeof system !== 'string' || !Array.isArray(messages)) {
    return json(
      { error: 'Request must include `system` (string) and `messages` (array).' },
      400,
    );
  }

  // --- Call Anthropic with the server-side key ------------------------------
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: model ?? DEFAULT_MODEL,
        max_tokens: max_tokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  } catch {
    return json(
      { error: 'Could not reach the Anthropic API. Please try again.' },
      502,
    );
  }

  // Pass the upstream status + body straight back so the client can map errors
  // (401/403 -> auth, 429 -> rate_limit, etc.). The key is never included.
  const bodyText = await upstream.text();
  return new Response(bodyText, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
});
