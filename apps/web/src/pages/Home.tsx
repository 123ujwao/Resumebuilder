import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PrivacySettings } from '../features/privacy';
import { AccountMenu } from '../features/auth';
import { Builder } from '../features/builder';
import { LivePreview } from '../features/templates';
import { ExportControls } from '../features/export';
import { PaymentModal } from '../features/payment';
import { TailoringPanel, VersionSwitcher } from '../features/tailoring';
import { CoverLetterPanel } from '../features/cover-letter';

/**
 * Product id for the base resume download. Products live in Supabase
 * (`products` table); this is the "resume_only" product's id supplied via env
 * so it isn't hard-coded. Task 10 (payment) resolves the full product record.
 */
const RESUME_PRODUCT_ID = import.meta.env.VITE_RESUME_PRODUCT_ID ?? 'resume_only';

/**
 * Home / Builder page — the normal user-facing screen (previously App.tsx).
 *
 * The Builder (natural-language intake + editable form, Task 4.2) is the main
 * screen. AI features route through the `anthropic-proxy` edge function, which
 * holds the single Anthropic key server-side, so users never enter a key — they
 * just need to be signed in.
 *
 * Note (Req 10.1): this page deliberately contains NO link to `/admin`. The
 * admin panel is reachable only by navigating to the route directly.
 */
export function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Product id whose UPI payment flow is open, or null when the modal is closed.
  const [paymentProductId, setPaymentProductId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link
              to="/"
              className="rounded text-2xl font-bold hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ResumeForge
            </Link>
            <p className="text-sm text-slate-500">
              Describe your experience — we'll build a resume you can edit.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Settings
            </button>
            <AccountMenu />
          </div>
        </div>
        {settingsOpen && (
          <div className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-5 sm:px-6">
              <PrivacySettings />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section aria-label="Resume builder">
            <Builder />
          </section>
          <section
            aria-label="Live preview"
            className="lg:sticky lg:top-8 lg:h-[calc(100vh-6rem)]"
          >
            <LivePreview />
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <VersionSwitcher />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <TailoringPanel />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <CoverLetterPanel
                onPaymentRequired={(productId) => setPaymentProductId(productId)}
              />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <ExportControls
                productId={RESUME_PRODUCT_ID}
                // The download gate opens the UPI payment flow (Task 10) when
                // free downloads are exhausted and no credits remain.
                onPaymentRequired={(productId) => setPaymentProductId(productId)}
              />
            </div>
          </section>
        </div>
      </main>

      <PaymentModal
        productId={paymentProductId}
        onClose={() => setPaymentProductId(null)}
      />
    </div>
  );
}
