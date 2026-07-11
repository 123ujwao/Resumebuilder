import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the client-side PDF text extractor (Req 2.5).
 *
 * pdf.js is mocked entirely so no real PDF parsing or worker runs: `getDocument`
 * returns a fake document whose pages yield canned text-content items. We assert
 * that page text is concatenated in order, and that failure modes surface a
 * typed {@link PdfTextError} (so the UI can fall back to manual paste).
 *
 * The Vite `?url` worker import is stubbed to a plain string since it has no
 * meaning under vitest.
 */

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument,
}));

// The `?url` worker import resolves to a URL string in a Vite build; stub it.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }));

import { extractPdfText, PdfTextError } from './pdfText';

/** Build a fake pdf.js document whose pages return the given text-item strings. */
function fakeDoc(pages: string[][]) {
  const destroy = vi.fn().mockResolvedValue(undefined);
  return {
    doc: {
      numPages: pages.length,
      getPage: vi.fn(async (n: number) => ({
        getTextContent: async () => ({
          items: pages[n - 1].map((str) => ({ str })),
        }),
      })),
      destroy,
    },
    destroy,
  };
}

/** Wrap a fake document so `getDocument(...).promise` resolves to it. */
function resolvesWith(doc: unknown) {
  return { promise: Promise.resolve(doc) };
}

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('concatenates text from all pages in order', async () => {
    const { doc, destroy } = fakeDoc([
      ['Jane', 'Doe'],
      ['Senior', 'Engineer'],
    ]);
    getDocument.mockReturnValue(resolvesWith(doc));

    const text = await extractPdfText(new ArrayBuffer(8));

    expect(text).toBe('Jane Doe\n\nSenior Engineer');
    // Resources released after extraction.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('reads a File input via arrayBuffer()', async () => {
    const { doc } = fakeDoc([['Hello', 'world']]);
    getDocument.mockReturnValue(resolvesWith(doc));

    const file = {
      name: 'resume.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as File;

    const text = await extractPdfText(file);

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(text).toBe('Hello world');
  });

  it('throws an "unreadable" PdfTextError when the document cannot be parsed', async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) });

    await expect(extractPdfText(new ArrayBuffer(8))).rejects.toMatchObject({
      name: 'PdfTextError',
      kind: 'unreadable',
    });
  });

  it('throws a "no_text" PdfTextError for a PDF with no selectable text', async () => {
    const { doc, destroy } = fakeDoc([[], ['   ']]);
    getDocument.mockReturnValue(resolvesWith(doc));

    await expect(extractPdfText(new ArrayBuffer(8))).rejects.toBeInstanceOf(PdfTextError);
    // Still cleans up even on the no-text failure.
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
