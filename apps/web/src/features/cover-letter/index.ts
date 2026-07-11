/**
 * Cover letter feature (Task 13, Req 5.1-5.4).
 *
 * - CoverLetterPanel : tone selector + JD → generateCoverLetter → editable
 *   letter (persisted) → PDF/DOCX export in the same template family, gated.
 * - coverLetterStore : persists the letter/tone/JD in localStorage (Req 5.3).
 * - coverLetterPdf / coverLetterDocx : template-family-matched exporters (5.4).
 */
export { CoverLetterPanel, type CoverLetterPanelProps } from './CoverLetterPanel';
export {
  useCoverLetterStore,
  loadPersistedCoverLetter,
  COVER_LETTER_STORAGE_KEY,
  type CoverLetterStoreState,
} from './coverLetterStore';
export {
  exportCoverLetterPdf,
  CoverLetterPdfDocument,
  splitParagraphs,
} from './coverLetterPdf';
export { exportCoverLetterDocx, buildCoverLetterDocx } from './coverLetterDocx';
