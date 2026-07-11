import { useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  setFreeForever,
  type AdminProduct,
  type AdminUserRow,
} from './adminData';

/**
 * Admin Users tab (Task 11.2, Req 10.3, 10.4).
 *
 * Renders a searchable table of every user with email, last login, free
 * downloads used (capped display at 2), credits remaining per product, and an
 * `is_free_forever` toggle. Search filters client-side by email substring.
 * Toggling free-forever calls the admin-only `set_free_forever` RPC and updates
 * the row optimistically, rolling back if the call fails.
 *
 * SECURITY NOTE: this UI is only shown after the client-side admin check. The
 * real enforcement is Supabase RLS + the security-definer RPC; the reads/writes
 * here fail safely for a non-admin.
 */

/** Max free downloads before gating kicks in (Req 8.3, 10.3). */
const FREE_DOWNLOAD_CAP = 2;

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

export function UsersTab() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Tracks which user rows have an in-flight toggle so we can disable them.
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>(
    {},
  );
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUsers()
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setUsers(data.users);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load users.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, query]);

  async function handleToggle(user: AdminUserRow) {
    const next = !user.is_free_forever;
    setToggleError(null);
    setPendingToggles((p) => ({ ...p, [user.id]: true }));
    // Optimistic update.
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id ? { ...u, is_free_forever: next } : u,
      ),
    );
    try {
      await setFreeForever(user.id, next);
    } catch (err: unknown) {
      // Roll back on failure.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, is_free_forever: !next } : u,
        ),
      );
      setToggleError(
        err instanceof Error
          ? err.message
          : 'Could not update free-forever access.',
      );
    } finally {
      setPendingToggles((p) => {
        const copy = { ...p };
        delete copy[user.id];
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
        Loading users…
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label className="flex-1">
          <span className="sr-only">Search users by email</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email…"
            aria-label="Search users by email"
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <span className="text-sm text-slate-500">
          {filtered.length} of {users.length} users
        </span>
      </div>

      {toggleError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {toggleError}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {users.length === 0
            ? 'No users yet.'
            : 'No users match your search.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Email
                </th>
                <th scope="col" className="px-4 py-3">
                  Last login
                </th>
                <th scope="col" className="px-4 py-3">
                  Free downloads
                </th>
                <th scope="col" className="px-4 py-3">
                  Credits per product
                </th>
                <th scope="col" className="px-4 py-3">
                  Free forever
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((user) => {
                const capped = Math.min(
                  user.free_downloads_used,
                  FREE_DOWNLOAD_CAP,
                );
                const toggling = Boolean(pendingToggles[user.id]);
                return (
                  <tr key={user.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatLastLogin(user.last_login_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {capped} / {FREE_DOWNLOAD_CAP}
                    </td>
                    <td className="px-4 py-3">
                      {products.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {products.map((product) => (
                            <li key={product.id} className="whitespace-nowrap">
                              <span className="text-slate-500">
                                {product.name}:
                              </span>{' '}
                              <span className="font-medium text-slate-900">
                                {user.creditsByProduct[product.id] ?? 0}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={user.is_free_forever}
                          disabled={toggling}
                          onChange={() => handleToggle(user)}
                          aria-label={`Toggle free forever for ${user.email}`}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 disabled:opacity-50"
                        />
                        <span className="text-xs text-slate-500">
                          {user.is_free_forever ? 'On' : 'Off'}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
