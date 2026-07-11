import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResumeData } from '@resume-forge/core';

import { ResumeForm } from './ResumeForm';
import { useResumeStore, createBaseVersion } from '../../store/resumeStore';

/**
 * Component tests for the editable form (Req 2.3, 2.8).
 *
 * Every field is editable and wired to the store; editing a field updates the
 * active version's data, and add/remove actions mutate the store.
 */

const seed: ResumeData = {
  personalInfo: { name: 'Grace', email: '', phone: '', location: '' },
  summary: '',
  experience: [
    {
      id: 'exp-1',
      company: 'Navy',
      title: 'Engineer',
      location: '',
      startDate: '',
      endDate: '',
      bullets: [{ id: 'b-1', text: 'Built a compiler.' }],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};

function seedStore(data: ResumeData) {
  cleanup();
  localStorage.clear();
  const base = createBaseVersion(data);
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: useResumeStore.getState().template,
  });
}

describe('ResumeForm', () => {
  beforeEach(() => seedStore(seed));

  it('edits a personal-info field and updates the store (Req 2.3)', async () => {
    const user = userEvent.setup();
    render(<ResumeForm />);

    const email = screen.getByLabelText('Email');
    await user.type(email, 'grace@example.com');

    expect(useResumeStore.getState().getActiveResumeData().personalInfo.email).toBe(
      'grace@example.com',
    );
  });

  it('edits an experience bullet and updates the store', async () => {
    const user = userEvent.setup();
    render(<ResumeForm />);

    const bullet = screen.getByDisplayValue('Built a compiler.');
    await user.clear(bullet);
    await user.type(bullet, 'Invented COBOL.');

    const data = useResumeStore.getState().getActiveResumeData();
    expect(data.experience[0].bullets[0].text).toBe('Invented COBOL.');
  });

  it('adds a new experience entry via the store action', async () => {
    const user = userEvent.setup();
    render(<ResumeForm />);

    await user.click(screen.getByRole('button', { name: /add experience/i }));

    expect(useResumeStore.getState().getActiveResumeData().experience).toHaveLength(2);
  });

  it('adds and edits a skill category (categorized skills, Req 2.3)', async () => {
    const user = userEvent.setup();
    render(<ResumeForm />);

    await user.click(screen.getByRole('button', { name: /add category/i }));
    const nameField = screen.getByLabelText('Category name');
    await user.type(nameField, 'Technical');

    const skills = useResumeStore.getState().getActiveResumeData().skills;
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('Technical');
  });

  it('renders accessible drag handles for experience entries and bullets (Req 2.4, 13.4)', () => {
    render(<ResumeForm />);

    // One handle for the single experience entry.
    expect(screen.getByRole('button', { name: 'Reorder experience' })).toBeInTheDocument();
    // One handle for its single bullet.
    expect(screen.getByRole('button', { name: 'Reorder bullet' })).toBeInTheDocument();
  });
});
