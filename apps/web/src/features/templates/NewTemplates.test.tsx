import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumeData } from '@resume-forge/core';

import { CompactTemplate } from './CompactTemplate';
import { TwoColumnTemplate } from './TwoColumnTemplate';
import { MinimalTemplate } from './MinimalTemplate';
import { LivePreview } from './LivePreview';
import {
  useResumeStore,
  createBaseVersion,
  DEFAULT_TEMPLATE,
} from '../../store/resumeStore';
import type { TemplateId } from '../../store/resumeStore';

/**
 * Tests for the remaining templates + ATS warning (Req 3.1, 3.2, 3.3, 3.6).
 */

const full: ResumeData = {
  personalInfo: {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    phone: '555-0199',
    location: 'Arlington',
    linkedin: '',
    portfolio: '',
  },
  summary: 'Computer scientist and pioneer of programming languages.',
  experience: [
    {
      id: 'exp-1',
      company: 'US Navy',
      title: 'Rear Admiral',
      location: 'Arlington',
      startDate: '1944',
      endDate: '1986',
      bullets: [
        { id: 'b-1', text: 'Developed the first compiler.' },
        { id: 'b-2', text: '' },
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Yale University',
      degree: 'PhD',
      field: 'Mathematics',
      startDate: '',
      endDate: '1934',
    },
  ],
  skills: [{ id: 'sk-1', name: 'Technical', skills: ['COBOL', 'Compilers'] }],
  projects: [
    {
      id: 'pr-1',
      name: 'A-0 System',
      description: 'Early compiler system.',
      bullets: [{ id: 'pb-1', text: 'Translated symbolic code.' }],
      techStack: ['UNIVAC'],
    },
  ],
  certifications: [{ id: 'c-1', name: 'National Medal of Technology' }],
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

const style = { font: 'Inter', accentColor: '#0f766e' };

describe.each([
  ['CompactTemplate', CompactTemplate, 'template-compact'],
  ['TwoColumnTemplate', TwoColumnTemplate, 'template-two-column'],
  ['MinimalTemplate', MinimalTemplate, 'template-minimal'],
] as const)('%s', (_name, Template, testId) => {
  beforeEach(() => cleanup());

  it('renders name and resume content', () => {
    render(<Template data={full} style={style} />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Developed the first compiler.')).toBeInTheDocument();
    expect(screen.getByText('Experience')).toBeInTheDocument();
  });

  it('does not use an HTML table for layout (ATS-friendly, Req 3.2)', () => {
    const { container } = render(<Template data={full} style={style} />);
    expect(container.querySelector('table')).toBeNull();
  });

  it('omits empty sections', () => {
    render(<Template data={empty} style={style} />);
    expect(screen.getByText('Solo Name')).toBeInTheDocument();
    expect(screen.queryByText('Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Education')).not.toBeInTheDocument();
  });

  it('does not render blank bullets', () => {
    render(<Template data={full} style={style} />);
    const items = screen.getAllByRole('listitem');
    for (const li of items) {
      expect(li.textContent?.trim()).toBeTruthy();
    }
  });
});

function seedStore(templateId: TemplateId) {
  cleanup();
  localStorage.clear();
  const base = createBaseVersion(full);
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: { ...DEFAULT_TEMPLATE, templateId },
  });
}

describe('ATS warning badge (Req 3.3)', () => {
  it('shows the warning only when the two-column template is selected', async () => {
    const user = userEvent.setup();
    seedStore('classic');
    render(<LivePreview />);

    // Not shown for a single-column template.
    expect(screen.queryByTestId('ats-warning')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Template'), 'two-column');

    // Shown once two-column is selected.
    expect(screen.getByTestId('ats-warning')).toBeInTheDocument();
    expect(screen.getByText(/may not be ATS-safe/i)).toBeInTheDocument();

    // Switching away hides it again.
    await user.selectOptions(screen.getByLabelText('Template'), 'minimal');
    expect(screen.queryByTestId('ats-warning')).not.toBeInTheDocument();
  });
});

describe('LivePreview with all templates + style', () => {
  it('reflects the selected accent color as a style passed to the template', async () => {
    const user = userEvent.setup();
    seedStore('modern');
    render(<LivePreview />);

    const target = '#7c3aed';
    await user.click(screen.getByLabelText(`Accent color ${target}`));

    expect(useResumeStore.getState().template.accentColor).toBe(target);
    // The heading uses the accent color inline; assert it is applied.
    const heading = screen.getByText('Grace Hopper');
    expect(heading).toHaveStyle({ color: target });
  });
});
