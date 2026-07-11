import { useState } from 'react';
import { exportMyData, deleteAllMyData } from './privacyData';
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  syncResumeToCloud,
} from './cloudSync';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuthStore } from '../auth';

/**
 * Privacy & data controls panel (Task 15, Req 12.3–12.6).
 *
 * Surfaces the two required controls — "Export my data" and "Delete all my
 * data" — plus a short privacy explainer and an OPTIONAL cross-device sync
 * toggle (Req 12.1, 12.2). Delete requires an explicit confirmation step.
 */
export function PrivacySettings() {
  const user = useAuthStore((s) => s.user);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [alsoDeleteKey, setAlsoDeleteKey] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const [syncEnabled, setSyncEnabled] = useState(isCloudSyncEnabled);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleExport = () => {
    exportMyData();
  };

  const handleConfirmDelete = () => {
    deleteAllMyData({ includeApiKey: alsoDeleteKey });
    setConfirmingDelete(false);
    setAlsoDeleteKey(false);
    setDeleted(true);
  };

  const handleToggleSync = (next: boolean) => {
    setSyncEnabled(next);
    setCloudSyncEnabled(next);
    setSyncMessage(null);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    const result = await syncResumeToCloud();
    setSyncing(false);
    setSyncMessage(
      result.ok ? 'Resume synced to your account.' : result.message,
    );
  };

  return (
    <section className="space-y-5" aria-labelledby="privacy-settings-title">
      <div className="space-y-1">
        <h3
          id="privacy-settings-title"
          className="text-base font-semibold text-slate-900"
        >
          Privacy & your data
        </h3>
        <p className="text-sm text-slate-600">
          Your resume stays in your browser. Your API key is stored only on this
          device and sent only to Anthropic. Only account info is stored in our
          database.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Export my data
        </button>

        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
              setDeleted(false);
            }}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete all my data
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">
              This permanently clears your resume content from this browser. This
              can't be undone.
            </p>
            <label className="flex items-center gap-2 text-sm text-red-700">
              <input
                type="checkbox"
                checked={alsoDeleteKey}
                onChange={(e) => setAlsoDeleteKey(e.target.checked)}
              />
              Also remove my stored Anthropic API key
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setAlsoDeleteKey(false);
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {deleted && (
          <span className="text-sm text-green-700">Local data cleared.</span>
        )}
      </div>

      {/* Optional cross-device sync (Req 12.1, 12.2) — clearly not required. */}
      <div className="space-y-2 border-t border-slate-200 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={syncEnabled}
            onChange={(e) => handleToggleSync(e.target.checked)}
            disabled={!isSupabaseConfigured}
          />
          Sync my resume across devices{' '}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <p className="text-sm text-slate-500">
          When on, your resume is stored in your account so you can pick up on
          another device. Off by default — your resume stays only in this
          browser.
        </p>
        {syncEnabled && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || !user}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {!user && (
              <span className="text-sm text-slate-500">
                Sign in to sync.
              </span>
            )}
            {syncMessage && (
              <span className="text-sm text-slate-600">{syncMessage}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
