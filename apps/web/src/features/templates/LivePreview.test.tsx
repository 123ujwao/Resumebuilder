import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumeData } from '@resume-forge/core';

import { LivePreview } from './LivePreview';
import { ClassicTemplate } from './ClassicTemplate';
import { ModernTemplate } from './ModernTemplate';
import {
  useResumeStore,
  createBaseVersion,
  DEFAULT_TEMPLATE,
} from '../../store/resumeStore';

/**
 * Component tests for template rendering + live preview (Req 3.1, 3.4, 3.5, 13.5).
 *
 * - Classic/Modern render resume content (name, bullets, sections).
 * - Switching template id keeps the same data rendered (Req 3.5).
 * - Empty sections are omitted.
 */

const full: ResumeData = {
  personalInfo: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    location: 'London',
    linkedin: '',
    portfolio: '',
  },
  summary: 'Pioneering mathematician and first programmer.',
  experience: [
    {
      id: 'exp-1',
      company: 'Analytical Engine Co',
      title: 'Lead Analyst',
      location: 'London',
      startDate: '1842',
      endDate: '1843',
      bullets: [
        { id: 'b-1', text: 'Wrote the first published algorithm.' },
        { id: 'b-2', text: '' },
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Home Tutoring',
      degree: 'Mathematics',
      field: 'Analysis',
      startDate: '',
      endDate: '',
    },
  ],
  skills: [{ id: 'sk-1', name: 'Technical', skills: ['Algorithms', 'Mathematics'] }],
  projects: [
    {
      id: 'pr-1',
      name: 'Bernoulli Program',
      description: 'Compute Bernoulli numbers.',
      bullets: [{ id: 'pb-1', text: 'Designed looping constructs.' }],
      techStack: ['Analytical Engine'],
    },
  ],
  certifications: [{ id: 'c-1', name: 'Fellow of Mathematics' }],
};

const empty: ResumeData = {
  personalInfo: { name: 'Solo Name', email: '', phone: '', location: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

function seedStore(data: ResumeData, templateId: 'classic' | 'modern' = 'classic') {
  cleanup();
  localStorage.clear();
  const base = createBaseVersion(data);
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: { ...DEFAULT_TEMPLATE, templateId },
  });
}

const style = { font: 'Inter', accentColor: '#0f766e' };

describe('ClassicTemplate', () => {
  beforeEach(() => cleanup());

  it('renders name, bullet, and section content', () => {
    render(<ClassicTemplate data={full} style={style} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.getByText('Wrote the first published algorithm.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
  });

  it('omits empty sections', () => {
    render(<ClassicTemplate data={empty} style={style} />);
    expect(screen.getByText('Solo Name')).toBeInTheDocument();
    expect(screen.queryByText('Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Education')).not.toBeInTheDocument();
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
  });

  it('does not render blank bullets', () => {
    render(<ClassicTemplate data={full} style={style} />);
    const lists = screen.getAllByRole('list');
    const items = lists.flatMap((l) => within(l).queryAllByRole('listitem'));
    // Every rendered list item must have visible text (blank bullet b-2 dropped).
    for (const li of items) {
      expect(li.textContent?.trim()).toBeTruthy();
    }
  });
});

describe('ModernTemplate', () => {
  beforeEach(() => cleanup());

  it('renders name and bullet content', () => {
    render(<ModernTemplate data={full} style={style} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.getByText('Wrote the first published algorithm.'),
    ).toBeInTheDocument();
  });

  it('omits empty sections', () => {
    render(<ModernTemplate data={empty} style={style} />);
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText('Certifications')).not.toBeInTheDocument();
  });
});

describe('LivePreview', () => {
  beforeEach(() => seedStore(full, 'classic'));

  it('renders the active resume data via the selected template', () => {
    render(<LivePreview />);
    expect(screen.getByTestId('template-classic')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('updates in real time when store data changes (Req 3.4, 13.5)', () => {
    render(<LivePreview />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    act(() => {
      useResumeStore.getState().updatePersonalInfo({ name: 'Charles Babbage' });
    });

    expect(screen.getByText('Charles Babbage')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('switching template renders the same data with no data loss (Req 3.5)', async () => {
    const user = userEvent.setup();
    render(<LivePreview />);

    // Classic initially.
    expect(screen.getByTestId('template-classic')).toBeInTheDocument();

    const dataBefore = useResumeStore.getState().getActiveResumeData();

    await user.selectOptions(screen.getByLabelText('Template'), 'modern');

    // Renderer swapped, same content still present.
    expect(screen.getByTestId('template-modern')).toBeInTheDocument();
    expect(screen.queryByTestId('template-classic')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      screen.getByText('Wrote the first published algorithm.'),
    ).toBeInTheDocument();

    // Underlying data is unchanged (byte-identical) after switching.
    const dataAfter = useResumeStore.getState().getActiveResumeData();
    expect(dataAfter).toEqual(dataBefore);
  });
});
