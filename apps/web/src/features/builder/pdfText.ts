import * as pdfjs from 'pdfjs-dist';
// Vite resolves this `?url` import to the built worker asset URL so pdf.js runs
// its parser off the main thread. Keeping the worker bundled by Vite means the
// whole PDF pipeline stays fully client-side — no CDN, no server (Req 2.5).
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Client-side PDF text extraction (Req 2.5).
 *
 * `extractPdfText` reads every page's text layer from a PDF and concatenates it
 * into a single string that can be fed straight into the shared extraction
 * pipeline (`extractResume`) — the same path used by the paste-text flow.
 *
 * Everything runs in the browser: the file is read as an `ArrayBuffer` and
 * parsed by pdf.js with a Vite-bundled worker. Nothing is uploaded.
 *
 * Failures (encrypted/corrupt files, or a PDF with no extractable text layer —
 * e.g. a scanned image) are surfaced as a typed {@link PdfTextError} rather than
 * a raw exception, so the UI can fall back to asking the user to paste text
 * manually (Req 2.5).
 */

// Configure the worker exactly once at module load.
pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

/** Reasons PDF text extraction can fail, mapped to user-facing guidance. */
export type PdfTextErrorKind =
  | 'no_text' // parsed fine but contained no selectable text (scanned/image PDF)
  | 'unreadable'; // could not be opened/parsed (corrupt, encrypted, not a PDF)

/**
 * Typed failure thrown by {@link extractPdfText}. The `kind` lets the UI choose
 * the right fallback message while always steering the user to manual paste.
 */
export class PdfTextError extends Error {
  readonly kind: PdfTextErrorKind;

  constructor(kind: PdfTextErrorKind, message: string) {
    super(message);
    this.name = 'PdfTextError';
    this.kind = kind;
  }
}

/** Normalize a File/Blob/ArrayBuffer input into an ArrayBuffer for pdf.js. */
async function toArrayBuffer(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input;
  // File extends Blob; both expose arrayBuffer().
  return input.arrayBuffer();
}

/**
 * Extract and concatenate the text content of every page in a PDF.
 *
 * @param input a `File` (from an upload/drop) or a raw `ArrayBuffer`.
 * @returns the concatenated, trimmed text of all pages.
 * @throws {PdfTextError} `unreadable` if the document can't be parsed, or
 *   `no_text` if it parses but yields no selectable text.
 */
export async function extractPdfText(input: File | Blob | ArrayBuffer): Promise<string> {
  const buffer = await toArrayBuffer(input);

  let doc;
  try {
    // `data` is transferred to the worker, so pass a copy-safe Uint8Array view.
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (cause) {
    throw new PdfTextError(
      'unreadable',
      "We couldn't read that PDF. It may be password-protected or corrupted. Paste your resume text instead.",
    );
  }

  try {
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        // Text items expose `str`; filter out marked-content items without it.
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pageTexts.push(pageText);
    }

    const combined = pageTexts.join('\n\n').replace(/[ \t]+/g, ' ').trim();

    if (combined.length === 0) {
      // Parsed successfully but no text layer — almost certainly a scanned PDF.
      throw new PdfTextError(
        'no_text',
        "This PDF doesn't contain selectable text (it may be a scan). Paste your resume text instead.",
      );
    }

    return combined;
  } finally {
    // Release worker resources regardless of outcome.
    await doc.destroy();
  }
}
