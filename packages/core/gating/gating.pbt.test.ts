import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  FREE_DOWNLOAD_LIMIT,
  decideDownload,
  type GateDecision,
  type GatingProfile,
  type GatingUserCredit,
} from './gating.js';

/**
 * Property-based tests for the pure gating decision function.
 *
 * `decideDownload` is a PURE decision (it never mutates). To validate the
 * *multi-step* invariants (Properties 1 & 3) we model a small pure "apply"
 * reducer here in the test that applies a {@link GateDecision} to a local
 * state, mirroring how the Supabase `consume_download` RPC (Task 8.3) will
 * mutate `free_downloads_used` / `credits_remaining`. Driving arbitrary
 * sequences of attempts through `decideDownload` + this reducer lets us assert
 * the invariants hold across all orderings.
 */

/** Local mutable-ish state driven through the reducer (copied, never mutated in place). */
interface GatingState {
  profile: GatingProfile;
  credits: GatingUserCredit[];
}

/**
 * Pure reducer: apply a gate decision to a state, returning the next state.
 * This is the model of what `consume_download` does after a decision:
 *  - allow (free_forever)        → no change
 *  - allow_and_increment_free    → free_downloads_used + 1
 *  - allow_and_decrement_credit  → matching product credit - 1
 *  - require_payment             → no change (download blocked)
 */
function applyDecision(
  state: GatingState,
  decision: GateDecision,
  productId: string,
): GatingState {
  switch (decision.action) {
    case 'allow':
      return state;
    case 'allow_and_increment_free':
      return {
        ...state,
        profile: {
          ...state.profile,
          free_downloads_used: state.profile.free_downloads_used + 1,
        },
      };
    case 'allow_and_decrement_credit':
      return {
        ...state,
        credits: state.credits.map((c) =>
          c.product_id === productId
            ? { ...c, credits_remaining: c.credits_remaining - 1 }
            : c,
        ),
      };
    case 'require_payment':
      return state;
    default: {
      // Exhaustiveness guard — a new action must be handled explicitly.
      const _never: never = decision;
      return _never;
    }
  }
}

/** A small fixed set of product ids so sequences repeatedly hit the same products. */
const PRODUCT_IDS = ['resume_only', 'resume_plus_cover_letter', 'bundle'] as const;
const productIdArb = fc.constantFrom(...PRODUCT_IDS);

describe('Gating PBT — Property 1: Free trial cap (Req 8.3, 8.4)', () => {
  it('never allows more than FREE_DOWNLOAD_LIMIT free-path downloads across any sequence, regardless of product ordering', () => {
    // **Validates: Requirements 8.3, 8.4**
    fc.assert(
      fc.property(
        fc.array(productIdArb, { minLength: 0, maxLength: 30 }),
        (attempts) => {
          // Non-free-forever user, starts fresh, NO credits at all.
          let state: GatingState = {
            profile: { is_free_forever: false, free_downloads_used: 0 },
            credits: [],
          };

          let freeGrants = 0;
          let paymentRequiredSeen = false;

          for (const productId of attempts) {
            const decision = decideDownload(state.profile, state.credits, productId);

            if (decision.action === 'allow_and_increment_free') {
              freeGrants += 1;
              // Free grants must never exceed the cap at any point.
              expect(freeGrants).toBeLessThanOrEqual(FREE_DOWNLOAD_LIMIT);
              // Once the free cap is used up, no further free grants may appear.
              expect(paymentRequiredSeen).toBe(false);
            } else {
              // With no credits, the only other possible decision is payment.
              expect(decision).toEqual({ action: 'require_payment', productId });
              paymentRequiredSeen = true;
            }

            state = applyDecision(state, decision, productId);
          }

          // Total free-path downloads over the whole run never exceed the cap.
          expect(freeGrants).toBeLessThanOrEqual(FREE_DOWNLOAD_LIMIT);
        },
      ),
    );
  });

  it('once free downloads reach the limit, every subsequent no-credit attempt requires payment', () => {
    // **Validates: Requirements 8.3, 8.4**
    fc.assert(
      fc.property(
        fc.array(productIdArb, { minLength: 1, maxLength: 30 }),
        (attempts) => {
          let state: GatingState = {
            profile: { is_free_forever: false, free_downloads_used: 0 },
            credits: [],
          };

          for (const productId of attempts) {
            const decision = decideDownload(state.profile, state.credits, productId);
            if (state.profile.free_downloads_used >= FREE_DOWNLOAD_LIMIT) {
              expect(decision).toEqual({ action: 'require_payment', productId });
            }
            state = applyDecision(state, decision, productId);
          }
        },
      ),
    );
  });
});

describe('Gating PBT — Property 2: Free-forever supremacy (Req 8.2)', () => {
  it('always allows via free_forever and leaves state unchanged for any counts/credits/product', () => {
    // **Validates: Requirements 8.2**
    const creditArb = fc.record({
      product_id: fc.constantFrom(...PRODUCT_IDS),
      credits_remaining: fc.integer({ min: -5, max: 100 }),
    });

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }), // arbitrary free_downloads_used
        fc.array(creditArb, { maxLength: 6 }), // arbitrary credits
        productIdArb,
        (freeUsed, credits, productId) => {
          const profile: GatingProfile = {
            is_free_forever: true,
            free_downloads_used: freeUsed,
          };
          const before: GatingState = { profile, credits };

          const decision = decideDownload(profile, credits, productId);

          // Always allow with the free_forever reason.
          expect(decision).toEqual({ action: 'allow', reason: 'free_forever' });

          // Applying it must not change free_downloads_used or any credit.
          const after = applyDecision(before, decision, productId);
          expect(after.profile.free_downloads_used).toBe(freeUsed);
          expect(after.credits).toEqual(credits);
        },
      ),
    );
  });
});

describe('Gating PBT — Property 3: Credit conservation (Req 8.5, 8.8)', () => {
  it('credit decrements per product never exceed credits granted, and balances never go negative', () => {
    // **Validates: Requirements 8.5, 8.8**
    const initialCreditArb = fc.record({
      product_id: fc.constantFrom(...PRODUCT_IDS),
      credits_remaining: fc.integer({ min: 0, max: 8 }),
    });

    fc.assert(
      fc.property(
        // Distinct-ish credit entries; dedupe by product below so "granted" is well-defined.
        fc.array(initialCreditArb, { maxLength: 6 }),
        fc.array(productIdArb, { minLength: 0, maxLength: 40 }),
        // Free-exhausted user so we exercise the credit path (Req 8.5 precondition).
        fc.integer({ min: FREE_DOWNLOAD_LIMIT, max: FREE_DOWNLOAD_LIMIT + 5 }),
        (rawCredits, attempts, freeUsed) => {
          // Collapse duplicate product entries into a single granted total per product.
          const grantedByProduct = new Map<string, number>();
          for (const c of rawCredits) {
            grantedByProduct.set(
              c.product_id,
              (grantedByProduct.get(c.product_id) ?? 0) + c.credits_remaining,
            );
          }
          const credits: GatingUserCredit[] = [...grantedByProduct.entries()].map(
            ([product_id, credits_remaining]) => ({ product_id, credits_remaining }),
          );

          let state: GatingState = {
            profile: { is_free_forever: false, free_downloads_used: freeUsed },
            credits,
          };

          const decrementsByProduct = new Map<string, number>();

          for (const productId of attempts) {
            const decision = decideDownload(state.profile, state.credits, productId);

            // Free is exhausted, so a free grant must never occur here.
            expect(decision.action).not.toBe('allow_and_increment_free');

            if (decision.action === 'allow_and_decrement_credit') {
              decrementsByProduct.set(
                productId,
                (decrementsByProduct.get(productId) ?? 0) + 1,
              );
            }

            state = applyDecision(state, decision, productId);

            // Invariant: no credit balance ever goes negative in the reducer.
            for (const c of state.credits) {
              expect(c.credits_remaining).toBeGreaterThanOrEqual(0);
            }
          }

          // Invariant: decrements per product never exceed credits initially granted.
          for (const [productId, decrements] of decrementsByProduct) {
            const granted = grantedByProduct.get(productId) ?? 0;
            expect(decrements).toBeLessThanOrEqual(granted);
          }
        },
      ),
    );
  });

  it('a credit decrement only follows exhausted free downloads (never while free remains)', () => {
    // **Validates: Requirements 8.5**
    const creditArb = fc.record({
      product_id: fc.constantFrom(...PRODUCT_IDS),
      credits_remaining: fc.integer({ min: 1, max: 8 }),
    });

    fc.assert(
      fc.property(
        fc.array(creditArb, { minLength: 1, maxLength: 6 }),
        fc.array(productIdArb, { minLength: 1, maxLength: 30 }),
        (credits, attempts) => {
          // Start with free downloads still available.
          let state: GatingState = {
            profile: { is_free_forever: false, free_downloads_used: 0 },
            credits,
          };

          for (const productId of attempts) {
            const decision = decideDownload(state.profile, state.credits, productId);
            if (decision.action === 'allow_and_decrement_credit') {
              // A credit may only be consumed once the free share is exhausted.
              expect(state.profile.free_downloads_used).toBeGreaterThanOrEqual(
                FREE_DOWNLOAD_LIMIT,
              );
            }
            state = applyDecision(state, decision, productId);
          }
        },
      ),
    );
  });
});
