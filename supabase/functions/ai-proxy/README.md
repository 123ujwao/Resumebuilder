# ai-proxy — hosted AI for ResumeForge (zero-cost, no user key)

This Supabase Edge Function lets end users use the AI features **without entering
their own API key**. It holds a single Google **Gemini free-tier** key as a
server-side secret and calls Gemini on the user's behalf. The key never reaches
the browser.

The web app talks to this function through
`packages/core/ai/proxyClient.ts` (`createProxyClient`) via
`apps/web/src/lib/aiClient.ts` (`getAiClient`).

## What the operator must do (one time)

### 1. Get a free Gemini API key (no credit card)

Create a key at <https://aistudio.google.com/apikey>. The free tier is enough for
personal / low-volume use.

### 2. Set the key as a function secret

Using the CLI:

```bash
supabase secrets set GEMINI_API_KEY=your_key
```

Or via the Dashboard: **Edge Functions → Manage secrets → Add new secret**
(name `GEMINI_API_KEY`).

### 3. Deploy the function

Using the CLI (recommended):

```bash
supabase functions deploy ai-proxy
```

To allow **logged-out users** to call the function, deploy with JWT verification
disabled:

```bash
supabase functions deploy ai-proxy --no-verify-jwt
```

If you keep the default (JWT verification on), the app still works because it
sends the Supabase **anon key** as the `Authorization` / `apikey` headers, which
satisfies the gateway.

Alternatively, paste the contents of `index.ts` into
**Dashboard → Edge Functions → Create function** (name it `ai-proxy`).

## How the web app finds it

The client builds the endpoint from environment variables (see
`apps/web/.env.example`):

- `VITE_AI_PROXY_URL` — full function URL (optional override), or
- `VITE_SUPABASE_URL` — the function is assumed at
  `${VITE_SUPABASE_URL}/functions/v1/ai-proxy`.

The request/response contract:

- **Request** `POST` JSON: `{ system?: string, messages: {role,content}[], maxTokens?: number }`
- **Response** `200` JSON: `{ text: string }`
- Errors: `500 { error: 'AI is not configured' }` when the secret is missing,
  `429` when Gemini rate-limits, `502 { error }` on other upstream failures.
