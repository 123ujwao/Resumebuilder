import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LivePreview } from './LivePreview';
import {
  useResumeStore,
  createBaseVersion,
  createEmptyResume,
} from '../../store/resumeStore';

/**
 * Integration check for the empty-state polish (Req 13.2).
 *
 * When the active resume has no content, the live preview shows a friendly
 * placeholder rather than an empty rendered template. Once content exists the
 * placeholder disappears.
 */
function resetStore(withContent = false) {
  cleanup();
  const data = createEmptyResume();
  if (withContent) data.personalInfo.name = 'Ada Lovelace';
  const base = createBaseVersion(data);
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: useResumeStore.getState().template,
  });
}

describe('LivePreview empty state', () => {
  beforeEach(() => resetStore());

  it('shows the friendly placeholder when the resume is empty', () => {
    render(<LivePreview />);
    expect(
      screen.getByText(/your resume preview will appear here/i),
    ).toBeInTheDocument();
  });

  it('renders the template (no placeholder) once content exists', () => {
    resetStore(true);
    render(<LivePreview />);
    expect(
      screen.queryByText(/your resume preview will appear here/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
