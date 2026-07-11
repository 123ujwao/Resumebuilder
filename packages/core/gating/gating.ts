/**
 * Download gating — pure decision function.
 *
 * The decision of whether a download is allowed (and how it should be
 * accounted for) is a pure function of the caller's profile, their per-product
 * credits, and the product being downloaded. This purity keeps the logic
 * trivially testable (unit + property-based) and lets it be shared verbatim by
 * the web app and the Chrome extension.
 *
 * IMPORTANT: this function performs NO side effects. It only *decides* what
 * should happen. The actual increment/decrement of `free_downloads_used` and
 * `credits_remaining` is performed atomically by the Supabase `consume_download`
 * RPC (Task 8.3), which runs under RLS so the limits cannot be bypassed by
 * clearing browser storage (Req 8.10).
 *
 * Decision order (Req 8.2–8.6):
 *   1. `is_free_forever`            → allow, no accounting          (Req 8.2)
 *   2. `free_downloads_used < 2`    → allow + increment free count  (Req 8.3)
 *      (the 2 free downloads are SHARED across all products — Req 8.4)
 *   3. `credits_remaining > 0`      → allow + decrement that credit (Req 8.5)
 *   4. otherwise                    → require payment               (Req 8.6)
 *
 * Building/editing/tailoring stay free and unlimited (Req 8.1); only downloads
 * are gated, which is why this function is invoked exclusively on the download
 * path.
 */

/**
 * The number of free downloads granted to every non-free-forever user,
 * shared across all product types (Req 8.3, 8.4).
 */
export const FREE_DOWNLOAD_LIMIT = 2;

/**
 * Minimal shape of the caller's profile needed for a gating decision.
 *
 * Mirrors the relevant columns of the Supabase `profiles` row. Kept local to
 * `packages/core` so the module stays framework-agnostic (no React/Supabase
 * imports).
 */
export interface GatingProfile {
  /** Admin-granted permanent exemption from gating (Req 8.2). */
  is_free_forever: boolean;
  /** Count of free downloads already consumed, shared across products (Req 8.4). */
  free_downloads_used: number;
}

/**
 * Minimal shape of a per-product credit balance (Supabase `user_credits` row).
 */
export interface GatingUserCredit {
  product_id: string;
  credits_remaining: number;
}

/**
 * The decision returned by {@link decideDownload}.
 *
 * - `allow` (free_forever)         : download immediately, touch nothing.
 * - `allow_and_increment_free`     : download, then increment the free counter.
 * - `allow_and_decrement_credit`   : download, then decrement the product credit.
 * - `require_payment`              : blocked; present the payment flow.
 */
export type GateDecision =
  | { action: 'allow'; reason: 'free_forever' }
  | { action: 'allow_and_increment_free' }
  | { action: 'allow_and_decrement_credit' }
  | { action: 'require_payment'; productId: string };

/**
 * True when `value` is a finite number strictly greater than zero.
 * Guards the credit branch against negative/NaN/Infinity balances so corrupt
 * data can never authorise a download.
 */
function hasPositiveBalance(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * True when the free counter is a usable, in-range count below the limit.
 * Non-finite or negative counters are treated as "not usable" for the free
 * branch (they fall through to credits / payment) rather than granting a
 * download from corrupt state.
 */
function hasFreeDownloadsRemaining(used: number): boolean {
  return Number.isFinite(used) && used >= 0 && used < FREE_DOWNLOAD_LIMIT;
}

/**
 * Decide how a download attempt for `productId` should be handled.
 *
 * Pure and side-effect free: the returned {@link GateDecision} describes the
 * accounting the caller (the `consume_download` RPC) must perform atomically.
 *
 * @param profile   the caller's profile (free-forever flag + free-count).
 * @param credits   the caller's per-product credit balances.
 * @param productId the product being downloaded.
 */
export function decideDownload(
  profile: GatingProfile,
  credits: GatingUserCredit[],
  productId: string,
): GateDecision {
  // 1. Free-forever short-circuits everything, regardless of counts/credits (Req 8.2).
  if (profile.is_free_forever === true) {
    return { action: 'allow', reason: 'free_forever' };
  }

  // 2. Shared free downloads before any credit is touched (Req 8.3, 8.4).
  if (hasFreeDownloadsRemaining(profile.free_downloads_used)) {
    return { action: 'allow_and_increment_free' };
  }

  // 3. A positive credit balance for THIS product (Req 8.5).
  //    A missing entry is treated as 0. If multiple entries somehow exist for
  //    the same product, any one with a positive balance is enough.
  const productCredit = credits.find((c) => c.product_id === productId);
  if (productCredit !== undefined && hasPositiveBalance(productCredit.credits_remaining)) {
    return { action: 'allow_and_decrement_credit' };
  }

  // 4. Nothing left — require payment for this product (Req 8.6).
  return { action: 'require_payment', productId };
}
