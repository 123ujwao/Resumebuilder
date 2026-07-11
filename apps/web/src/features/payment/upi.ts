/**
 * UPI deep-link builder (Task 10, Req 9.1).
 *
 * Pure, dependency-free construction of a `upi://pay` deep link so it is
 * trivial to unit-test and reuse. The resulting string is what gets encoded
 * into the QR code (via the `qrcode` library) and also shown as a tappable
 * link, so a user can either scan it or open it directly in a UPI app.
 *
 * Shape (Req 9.1):
 *   upi://pay?pa=<upi_id>&am=<price>&cu=INR&tn=<note>
 *
 * Notes:
 *  - The amount is pre-filled (Req 9.1) and formatted to a plain decimal string
 *    (e.g. 49 => "49.00", 49.5 => "49.50") so UPI apps parse it consistently.
 *  - `pa` (payee address / UPI id) and `tn` (transaction note) are URL-encoded
 *    so ids/notes containing reserved characters (`&`, spaces, etc.) don't
 *    break the query string.
 *  - `cu` is always `INR` per the product's manual-UPI design.
 */

/** Inputs for {@link buildUpiUri}. */
export interface BuildUpiUriParams {
  /** The payee UPI id (VPA), e.g. `operator@bank`. Read from payment_settings. */
  upiId: string;
  /** The amount to pre-fill, from the product's price. */
  amount: number | string;
  /** Optional transaction note, from payment_settings. */
  note?: string | null;
}

/**
 * Format a monetary amount as a plain 2-decimal string for the UPI `am` param.
 * Non-finite / unparseable values fall back to "0.00" so we never emit `NaN`.
 */
export function formatUpiAmount(amount: number | string): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) return '0.00';
  return n.toFixed(2);
}

/**
 * Build a `upi://pay` deep link from a payee id, amount, and optional note.
 *
 * @throws {Error} when `upiId` is missing/blank — a UPI link is meaningless
 *   without a payee address.
 */
export function buildUpiUri({ upiId, amount, note }: BuildUpiUriParams): string {
  const pa = (upiId ?? '').trim();
  if (!pa) {
    throw new Error('Cannot build a UPI link without a payee UPI id.');
  }

  const params = new URLSearchParams();
  params.set('pa', pa);
  params.set('am', formatUpiAmount(amount));
  params.set('cu', 'INR');
  const trimmedNote = note?.trim();
  if (trimmedNote) {
    params.set('tn', trimmedNote);
  }

  // URLSearchParams encodes spaces as '+'; UPI apps expect %20, so normalize.
  const query = params.toString().replace(/\+/g, '%20');
  return `upi://pay?${query}`;
}
