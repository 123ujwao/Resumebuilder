import { useState } from 'react';
import { FREE_DOWNLOAD_LIMIT } from '@resume-forge/core';
import { useAuthStore } from '../auth';
import { useResumeStore } from '../../store/resumeStore';
import { ButtonSpinner, useToast } from '../../components';
import { styleFromSelection } from '../templates/types';
import { attemptDownload, type GateOutcome } from '../download';
import { exportResumePdf } from './pdf';
import { exportResumeDocx } from './docx';
import { exportFilename } from './filename';
import { triggerBlobDownload } from './download';

/** The two supported export formats. */
export type ExportFormat = 'pdf' | 'docx';

/**
 * Export UI (Task 9, Req 6.1-6.4).
 *
 * Lets the user pick which saved version to export (defaults to the active
 * version — Req 6.3) and download it as PDF or DOCX. Both buttons run through
 * the download gate first (Req 6.4): {@link attemptDownload} calls the Supabase
 * `consume_download` RPC, and the file is only generated when the gate returns
 * `allowed`. On `payment_required` the injected `onPaymentRequired` hook fires
 * (Task 10); on `needs_auth` the auth modal is already open.
 *
 * Generation is fully in-browser (privacy — resume content never leaves the
 * client) and shows a loading state while running (Req 13.1).
 */
export interface ExportControlsProps {
  /** The `products.id` (uuid) gating this export. */
  productId: string;
  /** Task 10 payment flow hook, invoked when the gate returns payment_required. */
  onPaymentRequired?: (productId: string) => void | Promise<void>;
}

/** Build the capped free-count label (Req 8.9). Mirrors DownloadControls. */
function freeCountLabel(isFreeForever: boolean, used: number): string {
  if (isFreeForever) return 'Unlimited (free forever)';
  const clamped = Math.max(0, Math.min(used, FREE_DOWNLOAD_LIMIT));
  return `${clamped} of ${FREE_DOWNLOAD_LIMIT} free downloads used`;
}

export function ExportControls({ productId, onPaymentRequired }: ExportControlsProps) {
  const versions = useResumeStore((s) => s.versions);
  const activeVersionId = useResumeStore((s) => s.activeVersionId);
  const template = useResumeStore((s) => s.template);
  const profile = useAuthStore((s) => s.profile);
  const toast = useToast();

  // Which version to export — defaults to the active version (Req 6.3).
  const [selectedId, setSelectedId] = useState(activeVersionId);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isFreeForever = profile?.is_free_forever ?? false;
  const freeDownloadsUsed = profile?.free_downloads_used ?? 0;

  // The selected version, falling back to the active one if the selection is
  // stale (e.g. a version was removed).
  const version =
    versions.find((v) => v.id === selectedId) ??
    versions.find((v) => v.id === activeVersionId) ??
    versions[0];

  const runExport = async (format: ExportFormat) => {
    if (!version) return;
    setBusyFormat(format);
    setMessage(null);
    try {
      // Req 6.4: run the gate BEFORE producing any file.
      const outcome: GateOutcome = await attemptDownload(productId);

      const produce = async () => {
        const blob =
          format === 'pdf'
            ? await exportResumePdf(version, template.templateId, styleFromSelection(template))
            : await exportResumeDocx(version);
        triggerBlobDownload(blob, exportFilename(version, format));
      };

      switch (outcome.status) {
        case 'needs_auth':
          setMessage('Please sign in to download.');
          break;
        case 'allowed':
          await produce();
          toast.success('Your download is ready.');
          break;
        case 'unavailable':
          // Dev / no Supabase: gating is off, but still produce the file.
          await produce();
          setMessage('Download gating is unavailable in this environment.');
          break;
        case 'payment_required':
          await onPaymentRequired?.(outcome.productId);
          setMessage('You have used your free downloads. Payment is required.');
          break;
        case 'error':
          setMessage(outcome.message);
          toast.error(outcome.message);
          break;
      }
    } catch {
      const msg = 'Something went wrong generating your file. Please try again.';
      setMessage(msg);
      toast.error(msg);
    } finally {
      setBusyFormat(null);
    }
  };

  const busy = busyFormat !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="export-version" className="text-sm font-medium text-slate-700">
          Version to export
        </label>
        <select
          id="export-version"
          value={version?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-600" aria-live="polite">
        {freeCountLabel(isFreeForever, freeDownloadsUsed)}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void runExport('pdf')}
          disabled={busy}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busyFormat === 'pdf' && <ButtonSpinner />}
          {busyFormat === 'pdf' ? 'Generating…' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => void runExport('docx')}
          disabled={busy}
          className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busyFormat === 'docx' && <ButtonSpinner />}
          {busyFormat === 'docx' ? 'Generating…' : 'Download DOCX'}
        </button>
      </div>

      {message && (
        <p className="text-xs text-slate-500" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
