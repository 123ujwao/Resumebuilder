import { useEffect, useState } from 'react';
import {
  createProduct,
  getPaymentSettings,
  listProducts,
  setProductActive,
  updatePaymentSettings,
  updateProduct,
  type AdminProductRow,
  type PaymentSettings,
} from './adminData';

/**
 * Admin Products & Pricing tab (Task 11.4, Req 10.9).
 *
 * Two sections:
 *   - Products table: lists name, price, unlocks_count, and active status with
 *     inline editing. Editing a field persists via `updateProduct`; a
 *     Deactivate/Activate toggle flips `active` via `setProductActive`. An "Add
 *     product" form inserts via `createProduct`. Price and unlocks_count are
 *     validated as non-negative numbers before any write.
 *   - Payment settings: inputs for the global `upi_id` and payment `note`,
 *     loaded via `getPaymentSettings` and saved via `updatePaymentSettings`
 *     (upsert of the single id=1 row).
 *
 * Loading / empty / error / saving states are handled throughout.
 *
 * SECURITY NOTE: this UI is only shown after the client-side admin check, which
 * is UI-only. The authoritative access control is Supabase RLS — `products` and
 * `payment_settings` are publicly readable but admin-only writable via the
 * is_admin() write policies — so these direct writes fail safely for a
 * non-admin.
 */

/** Parse a non-negative number, returning null when invalid (Req 10.9). */
function parseNonNegative(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatPrice(price: number): string {
  if (Number.isNaN(price)) return '—';
  return `₹${price}`;
}

interface DraftProduct {
  name: string;
  price: string;
  unlocks_count: string;
}

const EMPTY_DRAFT: DraftProduct = { name: '', price: '', unlocks_count: '' };

export function ProductsTab() {
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Which product row is being edited, plus its in-progress draft.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  // Product ids with an in-flight write (edit save / active toggle).
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  // Add-product form state.
  const [newDraft, setNewDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);

  // Payment settings form state.
  const [settingsDraft, setSettingsDraft] = useState<PaymentSettings>({
    upi_id: '',
    note: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const [productRows, paymentSettings] = await Promise.all([
        listProducts(),
        getPaymentSettings(),
      ]);
      if (signal?.cancelled) return;
      setProducts(productRows);
      setSettingsDraft(paymentSettings);
    } catch (err: unknown) {
      if (signal?.cancelled) return;
      setError(
        err instanceof Error ? err.message : 'Could not load products.',
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

  function startEdit(product: AdminProductRow) {
    setActionError(null);
    setEditingId(product.id);
    setEditDraft({
      name: product.name,
      price: String(product.price),
      unlocks_count: String(product.unlocks_count),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds((p) => {
      if (busy) return { ...p, [id]: true };
      const copy = { ...p };
      delete copy[id];
      return copy;
    });
  }

  async function saveEdit(id: string) {
    const name = editDraft.name.trim();
    const price = parseNonNegative(editDraft.price);
    const unlocks = parseNonNegative(editDraft.unlocks_count);
    if (!name) {
      setActionError('Product name is required.');
      return;
    }
    if (price === null) {
      setActionError('Price must be a non-negative number.');
      return;
    }
    if (unlocks === null) {
      setActionError('Unlocks count must be a non-negative number.');
      return;
    }
    setActionError(null);
    setBusy(id, true);
    try {
      const updated = await updateProduct(id, {
        name,
        price,
        unlocks_count: unlocks,
      });
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      cancelEdit();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not update the product.',
      );
    } finally {
      setBusy(id, false);
    }
  }

  async function toggleActive(product: AdminProductRow) {
    setActionError(null);
    setBusy(product.id, true);
    try {
      const updated = await setProductActive(product.id, !product.active);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? updated : p)),
      );
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not update the product.',
      );
    } finally {
      setBusy(product.id, false);
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    const name = newDraft.name.trim();
    const price = parseNonNegative(newDraft.price);
    const unlocks = parseNonNegative(newDraft.unlocks_count);
    if (!name) {
      setActionError('Product name is required.');
      return;
    }
    if (price === null) {
      setActionError('Price must be a non-negative number.');
      return;
    }
    if (unlocks === null) {
      setActionError('Unlocks count must be a non-negative number.');
      return;
    }
    setActionError(null);
    setAdding(true);
    try {
      const created = await createProduct({
        name,
        price,
        unlocks_count: unlocks,
      });
      setProducts((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewDraft(EMPTY_DRAFT);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not create the product.',
      );
    } finally {
      setAdding(false);
    }
  }

  async function savePaymentSettings(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSettingsSaved(false);
    setSavingSettings(true);
    try {
      const saved = await updatePaymentSettings({
        upi_id: settingsDraft.upi_id.trim(),
        note: settingsDraft.note.trim(),
      });
      setSettingsDraft(saved);
      setSettingsSaved(true);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Could not save payment settings.',
      );
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
      >
        Loading products…
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

      {/* Products table (Req 10.9) */}
      <section aria-labelledby="products-heading" className="space-y-3">
        <h2
          id="products-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Products
        </h2>

        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No products yet. Add one below.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Unlocks
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const busy = Boolean(busyIds[product.id]);
                  const editing = editingId === product.id;
                  return (
                    <tr key={product.id} className="text-slate-700">
                      {editing ? (
                        <>
                          <td className="px-4 py-3">
                            <label className="block">
                              <span className="sr-only">Product name</span>
                              <input
                                type="text"
                                value={editDraft.name}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    name: e.target.value,
                                  }))
                                }
                                aria-label={`Edit name for ${product.name}`}
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                              />
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <label className="block">
                              <span className="sr-only">Price</span>
                              <input
                                type="number"
                                min="0"
                                value={editDraft.price}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    price: e.target.value,
                                  }))
                                }
                                aria-label={`Edit price for ${product.name}`}
                                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                              />
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <label className="block">
                              <span className="sr-only">Unlocks count</span>
                              <input
                                type="number"
                                min="0"
                                value={editDraft.unlocks_count}
                                onChange={(e) =>
                                  setEditDraft((d) => ({
                                    ...d,
                                    unlocks_count: e.target.value,
                                  }))
                                }
                                aria-label={`Edit unlocks count for ${product.name}`}
                                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                              />
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge active={product.active} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => saveEdit(product.id)}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                              >
                                {busy ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={cancelEdit}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {product.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatPrice(product.price)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {product.unlocks_count}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge active={product.active} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEdit(product)}
                                aria-label={`Edit ${product.name}`}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => toggleActive(product)}
                                aria-label={`${
                                  product.active ? 'Deactivate' : 'Activate'
                                } ${product.name}`}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {busy
                                  ? 'Working…'
                                  : product.active
                                    ? 'Deactivate'
                                    : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add product form (Req 10.9) */}
        <form
          onSubmit={addProduct}
          aria-label="Add product"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <label className="flex flex-col text-xs font-medium text-slate-500">
            Name
            <input
              type="text"
              value={newDraft.name}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, name: e.target.value }))
              }
              aria-label="New product name"
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-500">
            Price
            <input
              type="number"
              min="0"
              value={newDraft.price}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, price: e.target.value }))
              }
              aria-label="New product price"
              className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-500">
            Unlocks
            <input
              type="number"
              min="0"
              value={newDraft.unlocks_count}
              onChange={(e) =>
                setNewDraft((d) => ({ ...d, unlocks_count: e.target.value }))
              }
              aria-label="New product unlocks count"
              className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add product'}
          </button>
        </form>
      </section>

      {/* Payment settings (Req 10.9) */}
      <section aria-labelledby="settings-heading" className="space-y-3">
        <h2
          id="settings-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Payment settings
        </h2>

        <form
          onSubmit={savePaymentSettings}
          aria-label="Payment settings"
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <label className="block">
            <span className="text-xs font-medium text-slate-500">UPI ID</span>
            <input
              type="text"
              value={settingsDraft.upi_id}
              onChange={(e) => {
                setSettingsSaved(false);
                setSettingsDraft((s) => ({ ...s, upi_id: e.target.value }));
              }}
              aria-label="UPI ID"
              placeholder="name@bank"
              className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Payment note
            </span>
            <textarea
              value={settingsDraft.note}
              onChange={(e) => {
                setSettingsSaved(false);
                setSettingsDraft((s) => ({ ...s, note: e.target.value }));
              }}
              aria-label="Payment note"
              rows={2}
              className="mt-1 w-full max-w-lg rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {savingSettings ? 'Saving…' : 'Save settings'}
            </button>
            {settingsSaved && (
              <span role="status" className="text-sm text-emerald-600">
                Saved.
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
