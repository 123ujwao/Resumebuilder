import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  PAYMENT_NOT_CONFIGURED_MESSAGE,
  fetchPendingRequest,
  insertPaymentRequest,
  loadPaymentDetails,
  type PaymentDetails,
} from './paymentData';

/**
 * UPI payment modal (Task 10, Req 9.1-9.5, 9.7).
 *
 * Opened by the export flow when the download gate returns `payment_required`.
 * It shows the product name + price, a UPI QR code plus the raw `upi://` link
 * and payee id (so the user can scan OR tap), and an "I've paid" button.
 *
 * Clicking "I've paid" inserts a pending `payment_requests` row (Req 9.3) and
 * switches to a "Pending admin verification" state (Req 9.4) that clearly says
 * approval is manual and may take time (Req 9.5). If a pending request already
 * exists, the modal opens directly into that pending state and keeps the
 * download locked (no client-side unlock — credits are granted only by admin
 * approval). There is no payment gateway (Req 9.7).
 */
export interface PaymentModalProps {
  /** The `products.id` (uuid) to collect payment for. `null` closes the modal. */
  productId: string | null;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
}

type Phase = 'loading' | 'ready' | 'pending' | 'error';

/** Format a numeric price as INR for display. */
function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function PaymentModal({ productId, onClose }: PaymentModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = productId !== null;

  useEffect(() => {
    if (!open || productId === null) return;

    // Graceful degradation: no backend => can't take payments (Req 9.x).
    if (!isSupabaseConfigured) {
      setPhase('error');
      setError(PAYMENT_NOT_CONFIGURED_MESSAGE);
      return;
    }

    let cancelled = false;
    setPhase('loading');
    setError(null);
    setDetails(null);

    (async () => {
      try {
        // If a request is already pending, open straight into pending state and
        // keep the download locked (Req 9.4).
        const pending = await fetchPendingRequest(productId);
        if (cancelled) return;
        if (pending) {
          setPhase('pending');
          return;
        }
        const loaded = await loadPaymentDetails(productId);
        if (cancelled) return;
        setDetails(loaded);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load payment details.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  if (!open) return null;

  const handlePaid = async () => {
    if (!details || productId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      // Req 9.3: insert a pending payment_requests row for the signed-in user.
      await insertPaymentRequest({
        productId,
        amountClaimed: details.product.price,
      });
      setPhase('pending'); // Req 9.4
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="payment-modal-title" className="text-lg font-semibold text-slate-900">
            {phase === 'pending' ? 'Payment submitted' : 'Unlock downloads'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {phase === 'loading' && (
          <p className="text-sm text-slate-600" role="status">
            Loading payment details…
          </p>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {phase === 'ready' && details && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600">
                You've used your free downloads. Pay for{' '}
                <span className="font-medium text-slate-900">{details.product.name}</span>{' '}
                to unlock more.
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatInr(details.product.price)}
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
              <img
                src={details.qrDataUrl}
                alt="UPI payment QR code"
                className="h-48 w-48"
                width={192}
                height={192}
              />
              <p className="text-xs text-slate-500">Scan with any UPI app to pay</p>
              <a
                href={details.upiUri}
                className="break-all text-center text-xs font-medium text-blue-600 underline hover:text-blue-700"
              >
                {details.upiUri}
              </a>
              <p className="text-xs text-slate-500">
                UPI ID:{' '}
                <span className="font-medium text-slate-700">{details.settings.upi_id}</span>
              </p>
            </div>

            {/* Req 9.5: verification is manual and may take time. */}
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              After paying, tap "I've paid". Verification is done manually by an
              admin and may take some time. Your download stays locked until your
              payment is approved.
            </p>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePaid()}
                disabled={submitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : "I've paid"}
              </button>
            </div>
          </div>
        )}

        {phase === 'pending' && (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Pending admin verification
              </p>
              {/* Req 9.5: manual verification, may take time. */}
              <p className="mt-1 text-sm text-amber-800">
                Thanks! We've recorded your payment claim. An admin verifies UPI
                payments manually, so approval may take some time. Your download
                stays locked until it's approved — you don't need to pay again.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
