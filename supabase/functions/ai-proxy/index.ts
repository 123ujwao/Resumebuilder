// deno-lint-ignore-file no-explicit-any
/**
 * ai-proxy — Supabase Edge Function (Deno).
 *
 * PURPOSE
 * Routes all web-app AI calls through this server-side function so end users
 * never have to enter an API key, and the operator pays nothing. The function
 * holds ONE Groq FREE-TIER key as a server-side secret (`GROQ_API_KEY`, set via
 * `supabase secrets set`). The key is read here, on the server, and used to call
 * the Groq API. It is NEVER sent to, or reachable from, the browser — the
 * browser only ever talks to this function.
 *
 * Get a free key (no credit card) at https://console.groq.com/keys and set it as
 * a secret; see README.md in this folder for deploy instructions.
 */

/** CORS headers applied to every response (including preflight). */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Free Groq model + OpenAI-compatible chat completions endpoint. */
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
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
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // --- Read the Groq key (server-side secret) -------------------------------
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) {
    return json({ error: 'AI is not configured' }, 500);
  }

  // --- Parse the request body -----------------------------------------------
  let payload: ProxyRequestBody;
  try {
    payload = (await req.json()) as ProxyRequestBody;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { system, messages, maxTokens } = payload;
  if (!Array.isArray(messages)) {
    return json({ error: 'Request must include `messages` (array).' }, 400);
  }

  // --- Build the Groq (OpenAI-compatible) request body ----------------------
  // The system prompt becomes a leading { role: 'system' } message.
  const chatMessages: Array<{ role: string; content: string }> = [];
  if (typeof system === 'string' && system.length > 0) {
    chatMessages.push({ role: 'system', content: system });
  }
  for (const m of messages) {
    chatMessages.push({ role: m.role, content: m.content });
  }

  const groqBody = {
    model: GROQ_MODEL,
    messages: chatMessages,
    max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0.7,
  };

  // --- Call Groq with the server-side key -----------------------------------
  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(groqBody),
    });
  } catch {
    return json({ error: 'Could not reach the AI service.' }, 502);
  }

  // Surface the upstream (Groq) error detail for any non-2xx so failures are
  // diagnosable instead of opaque. (Rate limits included.)
  if (!upstream.ok) {
    let detail = '';
    try {
      detail = await upstream.text();
    } catch {
      detail = '';
    }
    return json(
      {
        error: `AI service error (HTTP ${upstream.status}).`,
        status: upstream.status,
        detail,
      },
      upstream.status === 429 ? 429 : 502,
    );
  }

  // --- Extract the generated text -------------------------------------------
  let data: any;
  try {
    data = await upstream.json();
  } catch {
    return json({ error: 'The AI service returned an unreadable response.' }, 502);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.length === 0) {
    return json({ error: 'empty response' }, 502);
  }

  return json({ text }, 200);
});
