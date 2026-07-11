/**
 * JD-based tailoring feature (Task 12.3, Req 4.4-4.7).
 *
 * - TailoringPanel : JD input → tailorResume(base) → matchScore + gaps + diff
 *   review with per-change accept/tweak/revert → save as a new version.
 * - VersionSwitcher: version history list that switches the active version.
 */
export { TailoringPanel } from './TailoringPanel';
export { VersionSwitcher } from './VersionSwitcher';
export { MatchScoreMeter } from './MatchScoreMeter';
export { GapsChecklist } from './GapsChecklist';
export { DiffView } from './DiffView';
export { tailoredVersionLabel } from './label';
export {
  applyPendingChanges,
  initPendingChanges,
  resolveFinalChanges,
  type PendingChange,
  type PendingChangeMap,
} from './applyChanges';
