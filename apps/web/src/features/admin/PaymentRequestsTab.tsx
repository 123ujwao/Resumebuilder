import { useEffect, useState } from 'react';
import {
  approvePayment,
  listPaymentRequests,
  rejectPayment,
  type AdminPaymentRequest,
} from './adminData';

/**
 * Admin Payment Requests tab (Task 11.3, Req 10.5, 10.6, 10.7, 10.8).
 *
 * Renders two sections:
 *   - Pending queue (Req 10.5): each row shows the requesting user's email, the
 *     product name, the amount claimed, and the request timestamp, with Approve
 *     / Reject buttons. Approving calls the `approve_payment` RPC (server-side:
 *     status→approved, credits += unlocks_count, approved_at stamped — Req
 *     10.6); rejecting calls `reject_payment` (status→rejected, no credits —
 *     Req 10.7). After a successful action we refetch so the row moves from the
 *     pending queue into history.
 *   - History (Req 10.8): read-only list of approved/rejected requests with
 *     their status and approved-at timestamp.
 *
 * Buttons are disabled while a request is in flight, and RPC errors surface
 * (e.g. the request is no longer pending — status monotonicity is enforced
 * server-side, not here).
 *
 * SECURITY NOTE: this UI is only shown after the client-side admin check. The
 * authoritative access control is Supabase RLS + the security-definer RPCs; the
 * reads/writes here fail safely for a non-admin.
 */

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatAmount(amount: number): string {
  if (Number.isNaN(amount)) return '—';
  return `₹${amount}`;
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  pending: 'bg-amber-50 text-amber-700',
};

export function PaymentRequestsTab() {
  const [pending, setPending] = useState<AdminPaymentRequest[]>([]);
  const [history, setHistory] = useState<AdminPaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Tracks which request rows have an in-flight approve/reject.
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>(
    {},
  );

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const data = await listPaymentRequests();
      if (signal?.cancelled) return;
      setPending(data.pending);
      setHistory(data.history);
    } catch (err: unknown) {
      if (signal?.cancelled) return;
      setError(
        err instanceof Error ? err.message : 'Could not load payment requests.',
      );
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(
    request: AdminPaymentRequest,
    action: (id: string) => Promise<void>,
  ) {
    setActionError(null);
    setPendingActions((p) => ({ ...p, [request.id]: true }));
    try {
      await action(request.id);
      // Refetch so the actioned row moves into history with its new status.
      await load();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Could not update this payment request.',
      );
    } finally {
      setPendingActions((p) => {
        const copy = { ...p };
        delete copy[request.id];
        return copy;
      });
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
      >
        Loading payment requests…
      </div>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {actionError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {/* Pending queue (Req 10.5, 10.6, 10.7) */}
      <section aria-labelledby="pending-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="pending-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Pending
          </h2>
          <span className="text-sm text-slate-500">
            {pending.length} awaiting review
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No pending payment requests.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Amount claimed
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Requested
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((request) => {
                  const busy = Boolean(pendingActions[request.id]);
                  return (
                    <tr key={request.id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {request.userEmail}
                      </td>
                      <td className="px-4 py-3">{request.productName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatAmount(request.amount_claimed)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatTimestamp(request.requested_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runAction(request, approvePayment)}
                            aria-label={`Approve payment request from ${request.userEmail}`}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {busy ? 'Working…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runAction(request, rejectPayment)}
                            aria-label={`Reject payment request from ${request.userEmail}`}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* History (Req 10.8) */}
      <section aria-labelledby="history-heading" className="space-y-3">
        <h2
          id="history-heading"
          className="text-lg font-semibold text-slate-900"
        >
          History
        </h2>

        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No past requests yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Amount claimed
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Resolved
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((request) => (
                  <tr key={request.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {request.userEmail}
                    </td>
                    <td className="px-4 py-3">{request.productName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatAmount(request.amount_claimed)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_STYLES[request.status] ??
                          'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTimestamp(request.approved_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
