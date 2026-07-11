/**
 * Resume export feature (Task 9, Req 6.1-6.4).
 *
 * Produces true-text PDF (via @react-pdf/renderer) and real Word DOCX (via the
 * `docx` package) for any saved resume version, and wires those exports through
 * the download gate before producing a file.
 */
export { exportResumePdf, ResumePdfDocument } from './pdf';
export { exportResumeDocx, buildResumeDocx } from './docx';
export { exportFilename, slugify } from './filename';
export { triggerBlobDownload } from './download';
export { ExportControls, type ExportFormat } from './ExportControls';
