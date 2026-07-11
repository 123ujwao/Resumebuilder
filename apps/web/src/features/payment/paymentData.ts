import QRCode from 'qrcode';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../auth';
import { buildUpiUri } from './upi';

/**
 * Payment data layer (Task 10, Req 9.1-9.4, 9.7).
 *
 * Framework-agnostic helpers (no React) so they can be unit-tested without a
 * DOM and, in principle, reused by the extension. Everything here talks only to
 * Supabase account-metadata tables (`products`, `payment_settings`,
 * `payment_requests`) — never to a payment gateway (Req 9.7, 14.2).
 *
 * Trust model: the caller never passes a user id. Inserts derive the user from
 * the authenticated session (`auth.uid()` server-side via RLS); we read the id
 * from the auth store only to satisfy the NOT NULL column and fail fast when
 * signed out. RLS enforces `user_id = auth.uid()` and `status = 'pending'`
 * regardless of what the client sends (Req 9.6).
 */

/** A purchasable unlock product (subset of the `products` row, Req 8.7). */
export interface PaymentProduct {
  id: string;
  name: string;
  price: number;
  unlocks_count: number;
}

/** Global UPI settings (the single `payment_settings` row, Req 9.2). */
export interface PaymentSettings {
  upi_id: string;
  note: string | null;
}

/** A user's payment request row (subset), used to show pending state (Req 9.4). */
export interface PaymentRequest {
  id: string;
  product_id: string;
  amount_claimed: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string | null;
}

/** Everything the payment UI needs to render the QR + details for a product. */
export interface PaymentDetails {
  product: PaymentProduct;
  settings: PaymentSettings;
  /** The raw `upi://pay?...` deep link (scannable + tappable, Req 9.1). */
  upiUri: string;
  /** A PNG data URL of the QR encoding {@link upiUri} (Req 9.1). */
  qrDataUrl: string;
}

/** Thrown when payment features are used without Supabase configured. */
export const PAYMENT_NOT_CONFIGURED_MESSAGE =
  'Payments require an account. Set up Supabase to enable paid downloads.';

/** Fetch a single product by id (price, name, unlocks_count) — Req 9.2. */
export async function fetchProduct(productId: string): Promise<PaymentProduct> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, unlocks_count')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw new Error('Could not load product details.');
  if (!data) throw new Error('That product is no longer available.');
  return data as PaymentProduct;
}

/** Fetch the global UPI settings (single-row table) — Req 9.2. */
export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_settings')
    .select('upi_id, note')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('Could not load payment settings.');
  if (!data) throw new Error('Payment settings are not configured yet.');
  return data as PaymentSettings;
}

/**
 * Generate a QR code PNG data URL for a UPI deep link (Req 9.1).
 * Isolated so tests can assert `qrcode.toDataURL` is invoked with the link.
 */
export async function generateUpiQr(upiUri: string): Promise<string> {
  return QRCode.toDataURL(upiUri, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
}

/**
 * Load everything needed to render the payment screen for a product:
 * the product (price/name), the UPI settings (upi_id/note), the built deep
 * link with the amount pre-filled, and the QR image (Req 9.1, 9.2).
 */
export async function loadPaymentDetails(productId: string): Promise<PaymentDetails> {
  const [product, settings] = await Promise.all([
    fetchProduct(productId),
    fetchPaymentSettings(),
  ]);
  const upiUri = buildUpiUri({
    upiId: settings.upi_id,
    amount: product.price,
    note: settings.note,
  });
  const qrDataUrl = await generateUpiQr(upiUri);
  return { product, settings, upiUri, qrDataUrl };
}

/**
 * Query the signed-in user's existing PENDING request for a product, if any.
 *
 * Used to open the payment UI directly into the pending state and to keep the
 * download locked while a request awaits admin verification (Req 9.4). RLS
 * restricts the read to the user's own rows.
 */
export async function fetchPendingRequest(
  productId: string,
): Promise<PaymentRequest | null> {
  const { user } = useAuthStore.getState();
  if (!user) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, product_id, amount_claimed, status, requested_at')
    .eq('product_id', productId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as PaymentRequest | null) ?? null;
}

/** Params for {@link insertPaymentRequest}. */
export interface InsertPaymentRequestParams {
  productId: string;
  amountClaimed: number;
}

/**
 * Insert a pending payment request for the signed-in user (Req 9.3).
 *
 * The user id comes from the authenticated session, NOT from the caller. The
 * row is always created with `status: 'pending'`; RLS refuses any other status
 * and enforces `user_id = auth.uid()` (Req 9.6). Returns the created row so the
 * UI can transition straight into the pending state.
 */
export async function insertPaymentRequest({
  productId,
  amountClaimed,
}: InsertPaymentRequestParams): Promise<PaymentRequest> {
  const { user } = useAuthStore.getState();
  if (!user) {
    throw new Error('Please sign in before submitting a payment.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_requests')
    .insert({
      user_id: user.id,
      product_id: productId,
      amount_claimed: amountClaimed,
      status: 'pending',
      requested_at: new Date().toISOString(),
    })
    .select('id, product_id, amount_claimed, status, requested_at')
    .single();
  if (error || !data) {
    throw new Error('Could not submit your payment. Please try again.');
  }
  return data as PaymentRequest;
}

/** Whether payment features can run (Supabase configured). */
export function isPaymentAvailable(): boolean {
  return isSupabaseConfigured;
}
