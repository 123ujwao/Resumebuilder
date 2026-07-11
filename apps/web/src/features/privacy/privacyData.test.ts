import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the privacy data layer (Task 15, Req 12.3, 12.4, 12.5).
 *
 * We assert:
 *  - exportMyData builds a JSON blob containing resume + cover letter content
 *    but NEVER the Anthropic API key (Req 12.3, 12.5),
 *  - deleteAllMyData clears the relevant localStorage keys and resets the
 *    stores (Req 12.4),
 *  - both work without Supabase configured (they only touch local data).
 */

// Capture blobs handed to the download helper so we can inspect their content.
const downloads: { blob: Blob; filename: string }[] = [];
vi.mock('../export', () => ({
  triggerBlobDownload: (blob: Blob, filename: string) =>
    downloads.push({ blob, filename }),
}));

import {
  exportMyData,
  deleteAllMyData,
  buildDataExportPayload,
  DATA_EXPORT_FILENAME,
} from './privacyData';
import {
  useResumeStore,
  RESUME_STATE_STORAGE_KEY,
} from '../../store/resumeStore';
import {
  useCoverLetterStore,
  COVER_LETTER_STORAGE_KEY,
} from '../cover-letter';
import { useApiKeyStore, API_KEY_STORAGE_KEY } from '../api-key';

// jsdom's Blob does not reliably expose its contents via .text(), so we spy on
// the Blob constructor to capture the JSON string that was serialized.
const blobParts: string[] = [];
const RealBlob = globalThis.Blob;
beforeEach(() => {
  blobParts.length = 0;
  vi.stubGlobal(
    'Blob',
    class extends RealBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        for (const p of parts) if (typeof p === 'string') blobParts.push(p);
      }
    },
  );
});

beforeEach(() => {
  downloads.length = 0;
  localStorage.clear();
  useResumeStore.getState().reset();
  useCoverLetterStore.setState({ letter: '', tone: 'formal', jd: '' });
  useApiKeyStore.setState({ apiKey: null });
});

describe('buildDataExportPayload', () => {
  it('includes resume + cover letter content but NOT the API key (Req 12.3, 12.5)', () => {
    useResumeStore.getState().updatePersonalInfo({ name: 'Ada Lovelace' });
    useCoverLetterStore.setState({
      letter: 'Dear hiring manager',
      tone: 'formal',
      jd: 'Backend engineer',
    });
    useApiKeyStore.setState({ apiKey: 'sk-ant-secret' });

    const payload = buildDataExportPayload();

    expect(payload.resume.versions[0].data.personalInfo.name).toBe('Ada Lovelace');
    expect(payload.coverLetter.letter).toBe('Dear hiring manager');
    expect(payload.coverLetter.jd).toBe('Backend engineer');

    // The API key must never appear anywhere in the serialized payload.
    expect(JSON.stringify(payload)).not.toContain('sk-ant-secret');
    expect(JSON.stringify(payload)).not.toMatch(/apiKey|anthropic_api_key/i);
  });
});

describe('exportMyData', () => {
  it('produces a downloadable JSON blob without the API key (Req 12.3, 12.5)', () => {
    useResumeStore.getState().updatePersonalInfo({ name: 'Grace Hopper' });
    useCoverLetterStore.setState({ letter: 'Hello', tone: 'formal', jd: 'JD' });
    useApiKeyStore.setState({ apiKey: 'sk-ant-topsecret' });

    exportMyData();

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe(DATA_EXPORT_FILENAME);
    expect(downloads[0].blob.type).toBe('application/json');

    const text = blobParts.join('');
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('Hello');
    expect(text).not.toContain('sk-ant-topsecret');
  });

  it('works without Supabase configured (local-only)', () => {
    // No Supabase mock here — exportMyData reads only local stores.
    expect(() => exportMyData()).not.toThrow();
    expect(downloads).toHaveLength(1);
  });
});

describe('deleteAllMyData', () => {
  it('clears local resume + cover letter storage and resets stores (Req 12.4)', () => {
    useResumeStore.getState().updatePersonalInfo({ name: 'To be deleted' });
    useCoverLetterStore.setState({ letter: 'Bye', tone: 'formal', jd: 'JD' });
    localStorage.setItem(RESUME_STATE_STORAGE_KEY, 'x');
    localStorage.setItem(COVER_LETTER_STORAGE_KEY, 'y');

    deleteAllMyData();

    expect(useResumeStore.getState().getActiveResumeData().personalInfo.name).toBe('');
    expect(useCoverLetterStore.getState().letter).toBe('');
    expect(useCoverLetterStore.getState().jd).toBe('');
    expect(localStorage.getItem(RESUME_STATE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(COVER_LETTER_STORAGE_KEY)).toBeNull();
  });

  it('keeps the API key by default but removes it when opted in (Req 12.5)', () => {
    useApiKeyStore.setState({ apiKey: 'sk-ant-keep' });
    localStorage.setItem(API_KEY_STORAGE_KEY, 'sk-ant-keep');

    deleteAllMyData();
    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-keep');

    deleteAllMyData({ includeApiKey: true });
    expect(useApiKeyStore.getState().apiKey).toBeNull();
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });
});
