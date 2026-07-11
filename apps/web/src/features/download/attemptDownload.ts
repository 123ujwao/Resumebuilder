import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../auth';

/**
 * Gated download orchestration (Task 8.3, Req 8.9, 8.10, 7.2).
 *
 * The authoritative gating decision + mutation is performed SERVER-SIDE by the
 * Supabase `consume_download` RPC (see supabase/migrations/0003_rpcs.sql). The
 * client never increments/decrements counts locally — doing so could be
 * bypassed by clearing browser storage (Req 8.10). Instead it:
 *
 *   1. ensures the user is signed in (Req 7.2) — opens the auth modal if not,
 *   2. calls `consume_download(p_product_id)` which atomically applies the
 *      free-forever → free-<2 → credit → payment-required order and mutates the
 *      server state,
 *   3. maps the returned status text to a {@link GateOutcome}, and
 *   4. on a successful consume, re-fetches the profile so the UI's free-count
 *      display reflects the new authoritative value.
 *
 * The pure `decideDownload` from `@resume-forge/core` is used elsewhere for
 * display/prediction only; it is NOT the source of truth for the mutation.
 */

/**
 * The status text returned by the `consume_download` Postgres RPC.
 * 'free_forever' | 'free' | 'credit' allow the download; 'payment_required'
 * blocks it and should trigger the payment flow (Task 10).
 */
export type ConsumeDownloadStatus =
  | 'free_forever'
  | 'free'
  | 'credit'
  | 'payment_required';

/**
 * Outcome of an {@link attemptDownload} call.
 *
 * - `needs_auth`        : user is signed out; the auth modal was opened. Abort.
 * - `allowed`           : the export may proceed (free-forever / free / credit).
 *                         `reason` carries which path granted it.
 * - `payment_required`  : blocked; caller should present the payment flow for
 *                         `productId` (Task 10).
 * - `unavailable`       : Supabase isn't configured (dev). Gating can't run;
 *                         the caller may proceed but should treat gating as off.
 * - `error`             : the RPC failed unexpectedly; `message` is friendly.
 */
export type GateOutcome =
  | { status: 'needs_auth' }
  | { status: 'allowed'; reason: ConsumeDownloadStatus }
  | { status: 'payment_required'; productId: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/** The statuses returned by the RPC that permit the download to proceed. */
const ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  'free_forever',
  'free',
  'credit',
]);

/**
 * Attempt a gated download for `productId`.
 *
 * This is framework-agnostic (no React) so it can be reused by the extension.
 * It reads/opens auth via the shared `useAuthStore`. On a successful consume it
 * refreshes the profile so the free-count display updates (Req 8.10).
 *
 * @param productId the `products.id` (uuid) being downloaded.
 */
export async function attemptDownload(productId: string): Promise<GateOutcome> {
  const auth = useAuthStore.getState();

  // 1. Require sign-in before producing any file (Req 7.2). When signed out we
  //    open the auth modal and abort; the RPC is never called.
  if (!auth.user) {
    auth.openModal();
    return { status: 'needs_auth' };
  }

  // 4. Dev / not-configured: gating can't run authoritatively. Keep the app
  //    usable without Supabase, but clearly signal gating is unavailable so
  //    production paths always go through the RPC.
  if (!isSupabaseConfigured) {
    return { status: 'unavailable' };
  }

  // 2. Authoritative, atomic, RLS-safe gating decision + mutation (Req 8.10).
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('consume_download', {
      p_product_id: productId,
    });

    if (error) {
      return {
        status: 'error',
        message:
          'We could not check your download access. Please try again in a moment.',
      };
    }

    const result = String(data) as ConsumeDownloadStatus;

    if (result === 'payment_required') {
      return { status: 'payment_required', productId };
    }

    if (ALLOWED_STATUSES.has(result)) {
      // 3. Refresh the profile so the free-count display reflects the new
      //    server-side value (Req 8.10). Never increment locally.
      await auth.refreshProfile();
      return { status: 'allowed', reason: result };
    }

    // Any unexpected status is treated as a non-fatal error rather than
    // silently allowing a download.
    return {
      status: 'error',
      message: 'Unexpected response while checking download access.',
    };
  } catch {
    return {
      status: 'error',
      message:
        'We could not check your download access. Please try again in a moment.',
    };
  }
}
