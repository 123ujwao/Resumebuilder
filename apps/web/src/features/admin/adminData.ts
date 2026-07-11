import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';

/**
 * Admin data layer (Task 11.2+, Req 10.3, 10.4).
 *
 * Framework-agnostic helpers (no React) so they can be unit-tested without a
 * DOM. Everything here talks only to Supabase account-metadata tables
 * (`profiles`, `products`, `user_credits`) and admin-only security-definer RPCs
 * (`set_free_forever`). Tasks 11.3/11.4 extend this module with sibling helpers
 * for the Payment Requests and Products & Pricing tabs.
 *
 * Trust model: reaching these functions only means the client-side admin check
 * passed. The authoritative access control is Supabase RLS + the
 * security-definer RPCs; a non-admin who calls these still cannot read all
 * profiles/credits or flip `is_free_forever`.
 */

/** A product row (subset) used for credit column headers (Req 8.7). */
export interface AdminProduct {
  id: string;
  name: string;
}

/**
 * A full product row shown in the Products & Pricing tab (Req 10.9).
 *
 * `unlocks_count` is how many downloads one purchase grants; `active` gates
 * whether the product is offered for sale. Deactivating never deletes a row so
 * historical payment requests keep resolving to a product name.
 */
export interface AdminProductRow {
  id: string;
  name: string;
  price: number;
  unlocks_count: number;
  active: boolean;
}

/** Fields required to create a product (Req 10.9). */
export interface NewProduct {
  name: string;
  price: number;
  unlocks_count: number;
  active?: boolean;
}

/** Editable fields on an existing product (Req 10.9). */
export type ProductPatch = Partial<Omit<AdminProductRow, 'id'>>;

/** Global payment settings: the UPI id + payment note (Req 9.2, 10.9). */
export interface PaymentSettings {
  upi_id: string;
  note: string;
}

/** The single payment_settings row lives at this fixed id (Req 10.9). */
const PAYMENT_SETTINGS_ID = 1;

/** A profile row (subset) shown in the Users tab (Req 7.4, 10.3). */
export interface AdminProfile {
  id: string;
  email: string;
  last_login_at: string | null;
  free_downloads_used: number;
  is_free_forever: boolean;
}

/** A single credit balance for a (user, product) pair (Req 8.8). */
export interface AdminUserCredit {
  user_id: string;
  product_id: string;
  credits_remaining: number;
}

/**
 * A user row for the Users tab, with credits stitched per product so each row
 * can render "credits remaining per product" (Req 10.3). `creditsByProduct`
 * maps product_id -> credits_remaining; a missing product means zero.
 */
export interface AdminUserRow extends AdminProfile {
  creditsByProduct: Record<string, number>;
}

/** Result of {@link listUsers}: the products (for headers) and stitched rows. */
export interface AdminUsersData {
  products: AdminProduct[];
  users: AdminUserRow[];
}

/** Thrown/surfaced when admin features are used without Supabase configured. */
export const ADMIN_NOT_CONFIGURED_MESSAGE =
  'The admin panel is unavailable because Supabase is not configured.';

/**
 * List all users for the Users tab (Req 10.3).
 *
 * Runs three simple queries — `profiles`, `products`, `user_credits` — and
 * stitches credits per user per product in JS rather than relying on a SQL
 * join. Admins can read all rows via RLS; a non-admin's identical calls return
 * only their own row (or nothing), so the panel degrades safely.
 */
export async function listUsers(): Promise<AdminUsersData> {
  const supabase = getSupabaseClient();

  const [profilesRes, productsRes, creditsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, last_login_at, free_downloads_used, is_free_forever')
      .order('email', { ascending: true }),
    supabase
      .from('products')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase.from('user_credits').select('user_id, product_id, credits_remaining'),
  ]);

  if (profilesRes.error) throw new Error('Could not load users.');
  if (productsRes.error) throw new Error('Could not load products.');
  if (creditsRes.error) throw new Error('Could not load user credits.');

  const products = (productsRes.data ?? []) as AdminProduct[];
  const profiles = (profilesRes.data ?? []) as AdminProfile[];
  const credits = (creditsRes.data ?? []) as AdminUserCredit[];

  // Group credits by user for O(1) stitching.
  const creditsByUser = new Map<string, Record<string, number>>();
  for (const c of credits) {
    const map = creditsByUser.get(c.user_id) ?? {};
    map[c.product_id] = c.credits_remaining;
    creditsByUser.set(c.user_id, map);
  }

  const users: AdminUserRow[] = profiles.map((p) => ({
    ...p,
    creditsByProduct: creditsByUser.get(p.id) ?? {},
  }));

  return { products, users };
}

/** Status of a payment request; mirrors the DB check constraint (Req 10.6, 10.7). */
export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * A payment request stitched with the product name and requesting user's email
 * (Req 10.5, 10.8).
 *
 * The raw `payment_requests` row only carries `product_id`/`user_id`; the Users
 * tab-style stitching in {@link listPaymentRequests} resolves those to a
 * human-readable `productName` and `userEmail` in JS so the tab can render them
 * without a SQL join.
 */
export interface AdminPaymentRequest {
  id: string;
  user_id: string;
  product_id: string;
  userEmail: string;
  productName: string;
  amount_claimed: number;
  status: PaymentRequestStatus;
  requested_at: string | null;
  approved_at: string | null;
}

/**
 * Result of {@link listPaymentRequests}: requests pre-split into the pending
 * queue (Req 10.5) and the read-only history of approved/rejected requests
 * (Req 10.8).
 */
export interface AdminPaymentRequestsData {
  pending: AdminPaymentRequest[];
  history: AdminPaymentRequest[];
}

/**
 * List all payment requests for the Payment Requests tab (Req 10.5, 10.8).
 *
 * Runs three simple queries — `payment_requests`, `products`, `profiles` — and
 * stitches the product name and user email onto each request in JS rather than
 * relying on a SQL join. Admins can read every request via RLS; a non-admin's
 * identical call returns only their own rows (or nothing), so the tab degrades
 * safely.
 *
 * Results are split so the UI can show the pending queue (oldest first, so the
 * longest-waiting user is actioned first) separately from the approved/rejected
 * history (most recent first).
 */
export async function listPaymentRequests(): Promise<AdminPaymentRequestsData> {
  const supabase = getSupabaseClient();

  const [requestsRes, productsRes, profilesRes] = await Promise.all([
    supabase
      .from('payment_requests')
      .select(
        'id, user_id, product_id, amount_claimed, status, requested_at, approved_at',
      )
      .order('requested_at', { ascending: false }),
    supabase.from('products').select('id, name'),
    supabase.from('profiles').select('id, email'),
  ]);

  if (requestsRes.error) throw new Error('Could not load payment requests.');
  if (productsRes.error) throw new Error('Could not load products.');
  if (profilesRes.error) throw new Error('Could not load user profiles.');

  const products = (productsRes.data ?? []) as AdminProduct[];
  const profiles = (profilesRes.data ?? []) as { id: string; email: string }[];
  const rows = (requestsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    product_id: string;
    amount_claimed: number;
    status: PaymentRequestStatus;
    requested_at: string | null;
    approved_at: string | null;
  }>;

  const productName = new Map(products.map((p) => [p.id, p.name]));
  const userEmail = new Map(profiles.map((p) => [p.id, p.email]));

  const requests: AdminPaymentRequest[] = rows.map((r) => ({
    ...r,
    productName: productName.get(r.product_id) ?? 'Unknown product',
    userEmail: userEmail.get(r.user_id) ?? 'Unknown user',
  }));

  // Pending queue oldest-first (fairness); history newest-first.
  const pending = requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
  const history = requests.filter((r) => r.status !== 'pending');

  return { pending, history };
}

/**
 * Approve a pending payment request (Req 10.6).
 *
 * Delegates to the admin-only `approve_payment` security-definer RPC, which
 * atomically sets `status='approved'`, stamps `approved_at`, and credits the
 * user's `credits_remaining` by the product's `unlocks_count` exactly once —
 * only from the `pending` state. The client never writes those columns
 * directly. Throws a friendly error on failure (e.g. the request is no longer
 * pending — status monotonicity — or RLS denies a non-admin caller).
 */
export async function approvePayment(requestId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('approve_payment', {
    p_request_id: requestId,
  });
  if (error) {
    throw new Error(
      'Could not approve this payment request. It may no longer be pending.',
    );
  }
}

/**
 * Reject a pending payment request (Req 10.7).
 *
 * Delegates to the admin-only `reject_payment` security-definer RPC, which sets
 * `status='rejected'` only from the `pending` state and never unlocks anything.
 * Throws a friendly error on failure (e.g. already actioned, or RLS denial).
 */
export async function rejectPayment(requestId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('reject_payment', {
    p_request_id: requestId,
  });
  if (error) {
    throw new Error(
      'Could not reject this payment request. It may no longer be pending.',
    );
  }
}

/**
 * Toggle a user's permanent free-download flag (Req 10.4, 10.7 gating).
 *
 * Delegates to the admin-only `set_free_forever` security-definer RPC so the
 * client never writes the protected column directly. Throws a friendly error
 * on failure (e.g. RLS denies a non-admin caller).
 */
export async function setFreeForever(
  userId: string,
  value: boolean,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('set_free_forever', {
    p_user_id: userId,
    p_value: value,
  });
  if (error) {
    throw new Error('Could not update free-forever access. Please try again.');
  }
}

/**
 * List every product for the Products & Pricing tab (Req 10.9).
 *
 * Returns the full row (including `price`, `unlocks_count`, `active`) ordered by
 * name, unlike {@link listUsers} which only needs id + name for column headers.
 * Publicly readable via RLS; only admin writes are restricted.
 */
export async function listProducts(): Promise<AdminProductRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, unlocks_count, active')
    .order('name', { ascending: true });
  if (error) throw new Error('Could not load products.');
  return (data ?? []) as AdminProductRow[];
}

/**
 * Create a new product (Req 10.9).
 *
 * A direct INSERT authorized by the admin-only write RLS policy (is_admin());
 * no dedicated RPC is needed. New products default to `active: true` unless
 * explicitly created inactive. Throws a friendly error on failure (e.g. RLS
 * denies a non-admin caller).
 */
export async function createProduct(
  product: NewProduct,
): Promise<AdminProductRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .insert({ active: true, ...product })
    .select('id, name, price, unlocks_count, active')
    .single();
  if (error || !data) {
    throw new Error('Could not create the product. Please try again.');
  }
  return data as AdminProductRow;
}

/**
 * Update an existing product's editable fields (Req 10.9).
 *
 * A direct UPDATE guarded by the admin-only write RLS policy. Used for editing
 * name/price/unlocks_count and (via {@link setProductActive}) toggling `active`.
 * Throws a friendly error on failure (e.g. RLS denies a non-admin caller).
 */
export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<AdminProductRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select('id, name, price, unlocks_count, active')
    .single();
  if (error || !data) {
    throw new Error('Could not update the product. Please try again.');
  }
  return data as AdminProductRow;
}

/**
 * Deactivate or reactivate a product (Req 10.9).
 *
 * Convenience wrapper over {@link updateProduct} that only flips `active`.
 * Deactivating hides the product from sale without deleting it, so historical
 * payment requests still resolve to a product name.
 */
export async function setProductActive(
  id: string,
  active: boolean,
): Promise<AdminProductRow> {
  return updateProduct(id, { active });
}

/**
 * Read the global payment settings (Req 9.2, 10.9).
 *
 * Reads the single `payment_settings` row (id=1) with `maybeSingle` so a
 * not-yet-seeded table returns sensible empty defaults rather than throwing.
 * Publicly readable via RLS.
 */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_settings')
    .select('upi_id, note')
    .eq('id', PAYMENT_SETTINGS_ID)
    .maybeSingle();
  if (error) throw new Error('Could not load payment settings.');
  return {
    upi_id: (data?.upi_id as string | undefined) ?? '',
    note: (data?.note as string | undefined) ?? '',
  };
}

/**
 * Update the global payment settings (Req 10.9).
 *
 * Upserts the single `payment_settings` row (id=1) so it works whether or not a
 * row already exists. A direct write authorized by the admin-only write RLS
 * policy. Throws a friendly error on failure (e.g. RLS denies a non-admin).
 */
export async function updatePaymentSettings(
  settings: PaymentSettings,
): Promise<PaymentSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('payment_settings')
    .upsert({ id: PAYMENT_SETTINGS_ID, ...settings })
    .select('upi_id, note')
    .single();
  if (error || !data) {
    throw new Error('Could not save payment settings. Please try again.');
  }
  return {
    upi_id: (data.upi_id as string | undefined) ?? '',
    note: (data.note as string | undefined) ?? '',
  };
}

/** Whether admin features can run (Supabase configured). */
export function isAdminDataAvailable(): boolean {
  return isSupabaseConfigured;
}
