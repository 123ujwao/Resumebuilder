/**
 * Data privacy feature (Task 15, Req 12.1-12.6).
 *
 * - PrivacySettings : UI panel with Export / Delete controls + optional sync.
 * - privacyData     : exportMyData / deleteAllMyData for local resume content.
 * - cloudSync       : OPTIONAL cross-device resume sync behind RLS (Req 12.2).
 *
 * Privacy guarantees enforced here:
 *  - The Anthropic API key is NEVER included in exports and NEVER sent to
 *    Supabase (Req 12.5) — it lives in `localStorage` only.
 *  - Resume content stays local by default and only reaches Supabase when the
 *    user explicitly opts into sync (Req 12.1); Supabase otherwise holds only
 *    account metadata (Req 12.6).
 */
export {
  exportMyData,
  deleteAllMyData,
  buildDataExportPayload,
  DATA_EXPORT_VERSION,
  DATA_EXPORT_FILENAME,
  type DataExportPayload,
  type DeleteDataOptions,
  type ExportedCoverLetter,
} from './privacyData';
export {
  syncResumeToCloud,
  loadResumeFromCloud,
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  CLOUD_SYNC_ENABLED_KEY,
  type SyncResult,
} from './cloudSync';
export { PrivacySettings } from './PrivacySettings';
