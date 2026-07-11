/**
 * Payment-request state machine — pure model.
 *
 * The authoritative approve/reject logic lives in the Supabase security-definer
 * RPCs `approve_payment` / `reject_payment` (supabase/migrations/0003_rpcs.sql).
 * Those RPCs enforce that a `payment_request`:
 *   - transitions ONLY from 'pending' → 'approved' (approve) or
 *     'pending' → 'rejected' (reject);
 *   - raises and makes NO change on any call when it is not 'pending';
 *   - grants the product's `unlocks_count` credits EXACTLY ONCE, in the same
 *     transaction as the pending → approved flip.
 *
 * Postgres cannot run in the unit-test environment, so this module extracts a
 * PURE TypeScript model of that state machine (transition table + credit
 * granting) that mirrors the RPC semantics. It is what the property-based tests
 * drive (mirroring the gating PBT pattern: pure decision/reducer + PBT over
 * sequences). Keeping it framework-agnostic in `packages/core` lets both the
 * web app and the extension reuse the exact same transition rules.
 *
 * Design reference: design.md > "Property 6: Status monotonicity".
 * Requirements: 10.6, 10.7.
 */

/** The lifecycle states of a payment request (mirrors the DB `status` column). */
export type PaymentStatus = 'pending' | 'approved' | 'rejected';

/**
 * The observable state of a single payment request.
 *
 * `creditsGranted` models the TOTAL credits added to the user for this request.
 * In the RPC this maps to the product's `unlocks_count` credited on approval
 * (and only on approval). It starts at 0 and, per the exactly-once guarantee,
 * can only ever change once — on the single successful `pending → approved`
 * transition.
 */
export interface PaymentRequestState {
  status: PaymentStatus;
  /** Total credits granted for this request so far (0 until approved). */
  creditsGranted: number;
}

/**
 * The result of applying a transition: the next state plus whether the call
 * actually changed anything.
 *
 * `changed` mirrors the RPC's success/raise distinction: a successful
 * transition (from 'pending') returns `changed: true`; a call on a non-pending
 * request is a no-op here (`changed: false`) — the RPC raises an exception and
 * makes no change, and the observable invariant we care about is precisely
 * "state is unchanged".
 */
export interface TransitionResult {
  state: PaymentRequestState;
  changed: boolean;
}

/** The initial state of a freshly-inserted payment request. */
export function initialPaymentRequestState(): PaymentRequestState {
  return { status: 'pending', creditsGranted: 0 };
}

/**
 * Apply an "approve" action, mirroring `approve_payment`.
 *
 * - From 'pending': transition to 'approved' and grant `unlocksCount` credits
 *   (added to `creditsGranted`). This is the ONLY branch that grants credits.
 * - From any other status: no-op (`changed: false`). The RPC raises and makes
 *   no change; the model reflects that as an unchanged state.
 *
 * @param state        current request state.
 * @param unlocksCount the product's `unlocks_count` (credits to grant). Only
 *                     applied on a successful pending → approved transition.
 */
export function applyApprove(
  state: PaymentRequestState,
  unlocksCount: number,
): TransitionResult {
  if (state.status === 'pending') {
    return {
      state: {
        status: 'approved',
        creditsGranted: state.creditsGranted + unlocksCount,
      },
      changed: true,
    };
  }
  // Not pending → RPC would raise; observable effect is "no change".
  return { state, changed: false };
}

/**
 * Apply a "reject" action, mirroring `reject_payment`.
 *
 * - From 'pending': transition to 'rejected', granting NO credits.
 * - From any other status: no-op (`changed: false`), matching the RPC raising
 *   and making no change.
 */
export function applyReject(state: PaymentRequestState): TransitionResult {
  if (state.status === 'pending') {
    return {
      state: { status: 'rejected', creditsGranted: state.creditsGranted },
      changed: true,
    };
  }
  return { state, changed: false };
}
