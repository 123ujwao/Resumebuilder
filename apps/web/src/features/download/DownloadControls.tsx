import { useState } from 'react';
import { FREE_DOWNLOAD_LIMIT } from '@resume-forge/core';
import { useAuthStore } from '../auth';
import { attemptDownload, type GateOutcome } from './attemptDownload';

/**
 * Download gating UI (Task 8.3, Req 8.9, 8.10).
 *
 * Shows the free-download count CAPPED at the shared free limit (Req 8.9),
 * e.g. "1 of 2 free downloads used", or "Unlimited (free forever)" when the
 * admin has granted the free-forever override. A Download button runs the
 * server-side gate via {@link attemptDownload}.
 *
 * Actual PDF/DOCX generation (Task 9) and the payment flow (Task 10) are NOT
 * implemented here — they are injected as callbacks (`onAllowed` /
 * `onPaymentRequired`) so those tasks can plug in without reworking this
 * component.
 */
export interface DownloadControlsProps {
  /** The `products.id` (uuid) this control downloads. */
  productId: string;
  /** Optional human label for the product (e.g. "Resume"). */
  productLabel?: string;
  /**
   * Called when the gate allows the download (free-forever / free / credit).
   * Task 9 wires the real export here. `reason` carries which path granted it.
   */
  onAllowed?: (reason: string) => void | Promise<void>;
  /**
   * Called when the gate returns payment_required. Task 10 wires the UPI flow.
   */
  onPaymentRequired?: (productId: string) => void | Promise<void>;
}

/** Build the capped free-count label (Req 8.9). */
export function freeCountLabel(
  isFreeForever: boolean,
  freeDownloadsUsed: number,
): string {
  if (isFreeForever) return 'Unlimited (free forever)';
  // Clamp both ends: never show negative, never exceed the cap in the UI.
  const used = Math.max(0, Math.min(freeDownloadsUsed, FREE_DOWNLOAD_LIMIT));
  return `${used} of ${FREE_DOWNLOAD_LIMIT} free downloads used`;
}

export function DownloadControls({
  productId,
  productLabel = 'resume',
  onAllowed,
  onPaymentRequired,
}: DownloadControlsProps) {
  const profile = useAuthStore((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isFreeForever = profile?.is_free_forever ?? false;
  const freeDownloadsUsed = profile?.free_downloads_used ?? 0;

  const handleDownload = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome: GateOutcome = await attemptDownload(productId);
      switch (outcome.status) {
        case 'needs_auth':
          // The auth modal was opened; nothing else to do here.
          setMessage('Please sign in to download.');
          break;
        case 'allowed':
          await onAllowed?.(outcome.reason);
          break;
        case 'payment_required':
          await onPaymentRequired?.(outcome.productId);
          setMessage('You have used your free downloads. Payment is required.');
          break;
        case 'unavailable':
          // Dev / no Supabase: allow the export but note gating is off.
          setMessage('Download gating is unavailable in this environment.');
          await onAllowed?.('unavailable');
          break;
        case 'error':
          setMessage(outcome.message);
          break;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-600" aria-live="polite">
        {freeCountLabel(isFreeForever, freeDownloadsUsed)}
      </p>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={busy}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? 'Checking…' : `Download ${productLabel}`}
      </button>
      {message && (
        <p className="text-xs text-slate-500" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
