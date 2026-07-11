import { useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { PaymentRequestsTab } from './PaymentRequestsTab';
import { ProductsTab } from './ProductsTab';
import { UsersTab } from './UsersTab';

/**
 * Admin panel shell (Task 11.1, Req 10.1, 10.2).
 *
 * This is the container rendered by {@link AdminRoute} once the current user is
 * confirmed to be an admin. It provides the heading and tab navigation
 * structure (Users / Payment Requests / Products & Pricing). The tab contents
 * themselves live in their own tab components:
 *   - Users tab → Task 11.2 (UsersTab)
 *   - Payment Requests tab → Task 11.3 (PaymentRequestsTab)
 *   - Products & Pricing tab → Task 11.4 (ProductsTab)
 *
 * SECURITY NOTE: reaching this component only means the client-side admin check
 * passed (used to show/hide UI). The real enforcement is Supabase RLS + the
 * security-definer RPCs on the server; a user who forces their way to this
 * shell still cannot read or write admin-only data.
 */

type AdminTab = 'users' | 'payments' | 'products';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'payments', label: 'Payment Requests' },
  { id: 'products', label: 'Products & Pricing' },
];

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Admin-backed data requires Supabase; degrade gracefully when unconfigured.
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p
          role="alert"
          className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          The admin panel is unavailable because Supabase is not configured. Set
          VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable it.
        </p>
      </div>
    );
  }

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin panel</h1>
        <p className="text-sm text-slate-500">
          Manage users, verify payments, and configure pricing.
        </p>
      </header>

      <nav
        aria-label="Admin sections"
        className="flex gap-1 border-b border-slate-200"
      >
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                selected
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section role="tabpanel" aria-label={active.label} className="mt-6">
        {active.id === 'users' ? (
          <UsersTab />
        ) : active.id === 'payments' ? (
          <PaymentRequestsTab />
        ) : (
          <ProductsTab />
        )}
      </section>
    </div>
  );
}
