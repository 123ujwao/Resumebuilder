import { useResumeStore } from '../../store/resumeStore';
import { newId } from './ids';
import { EntryCard, FormSection, TextAreaField, TextField } from './fields';
import { SortableItem, SortableList } from './Sortable';

/**
 * Editable resume form (Req 2.3, 2.8).
 *
 * Renders every section of the active {@link ResumeData} as editable fields:
 * personalInfo, summary, experience (with bullets), education, skills
 * (categorized), projects (with bullets + techStack), and certifications.
 *
 * EVERY field is editable and wired straight to the resume store, which is the
 * source of truth after extraction (Req 2.8). Sections with dedicated store
 * actions (personalInfo, summary, experience, bullets) use them; the remaining
 * sections mutate immutably through `updateActiveResumeData`.
 *
 * Adding/removing entries and bullets is handled here with buttons. Reordering
 * of experience entries, experience bullets, and project bullets is done via
 * drag-and-drop (@dnd-kit) with a labelled drag handle and a visible dragging
 * state (Task 4.3, Req 2.4 + 13.4).
 */
export function ResumeForm() {
  const data = useResumeStore((s) => s.getActiveVersion().data);
  const updatePersonalInfo = useResumeStore((s) => s.updatePersonalInfo);
  const setSummary = useResumeStore((s) => s.setSummary);
  const addExperience = useResumeStore((s) => s.addExperience);
  const updateExperience = useResumeStore((s) => s.updateExperience);
  const removeExperience = useResumeStore((s) => s.removeExperience);
  const reorderExperience = useResumeStore((s) => s.reorderExperience);
  const addBullet = useResumeStore((s) => s.addBullet);
  const updateBullet = useResumeStore((s) => s.updateBullet);
  const removeBullet = useResumeStore((s) => s.removeBullet);
  const reorderBullets = useResumeStore((s) => s.reorderBullets);
  const reorderProjectBullets = useResumeStore((s) => s.reorderProjectBullets);
  const update = useResumeStore((s) => s.updateActiveResumeData);

  return (
    <div className="space-y-5">
      {/* --- Personal info ------------------------------------------------ */}
      <FormSection title="Personal info">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Full name"
            value={data.personalInfo.name}
            onChange={(v) => updatePersonalInfo({ name: v })}
          />
          <TextField
            label="Email"
            type="email"
            value={data.personalInfo.email}
            onChange={(v) => updatePersonalInfo({ email: v })}
          />
          <TextField
            label="Phone"
            value={data.personalInfo.phone}
            onChange={(v) => updatePersonalInfo({ phone: v })}
          />
          <TextField
            label="Location"
            value={data.personalInfo.location}
            onChange={(v) => updatePersonalInfo({ location: v })}
          />
          <TextField
            label="LinkedIn"
            value={data.personalInfo.linkedin ?? ''}
            onChange={(v) => updatePersonalInfo({ linkedin: v })}
          />
          <TextField
            label="Portfolio"
            value={data.personalInfo.portfolio ?? ''}
            onChange={(v) => updatePersonalInfo({ portfolio: v })}
          />
        </div>
      </FormSection>

      {/* --- Summary ------------------------------------------------------ */}
      <FormSection title="Summary">
        <TextAreaField
          label="Professional summary"
          value={data.summary}
          onChange={setSummary}
          placeholder="A short summary of who you are and what you're looking for."
        />
      </FormSection>

      {/* --- Experience --------------------------------------------------- */}
      <FormSection
        title="Experience"
        description="Your work history. Add bullets describing what you did."
        onAdd={() => addExperience()}
        addLabel="Add experience"
      >
        {data.experience.length === 0 ? (
          <p className="text-sm text-slate-400">No experience yet.</p>
        ) : (
          <SortableList
            ids={data.experience.map((exp) => exp.id)}
            onReorder={reorderExperience}
          >
            <div className="space-y-4">
              {data.experience.map((exp) => (
                <SortableItem key={exp.id} id={exp.id} handleLabel="Reorder experience">
                  {(handle) => (
                    <EntryCard handle={handle} onRemove={() => removeExperience(exp.id)}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField
                          label="Company"
                          value={exp.company}
                          onChange={(v) => updateExperience(exp.id, { company: v })}
                        />
                        <TextField
                          label="Title"
                          value={exp.title}
                          onChange={(v) => updateExperience(exp.id, { title: v })}
                        />
                        <TextField
                          label="Location"
                          value={exp.location}
                          onChange={(v) => updateExperience(exp.id, { location: v })}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <TextField
                            label="Start"
                            value={exp.startDate}
                            onChange={(v) => updateExperience(exp.id, { startDate: v })}
                          />
                          <TextField
                            label="End"
                            value={exp.endDate}
                            onChange={(v) => updateExperience(exp.id, { endDate: v })}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">Bullets</span>
                          <button
                            type="button"
                            onClick={() => addBullet(exp.id)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                          >
                            Add bullet
                          </button>
                        </div>
                        {exp.bullets.length === 0 ? (
                          <p className="text-xs text-slate-400">No bullets yet.</p>
                        ) : (
                          <SortableList
                            ids={exp.bullets.map((b) => b.id)}
                            onReorder={(from, to) => reorderBullets(exp.id, from, to)}
                          >
                            <div className="space-y-2">
                              {exp.bullets.map((bullet) => (
                                <SortableItem
                                  key={bullet.id}
                                  id={bullet.id}
                                  handleLabel="Reorder bullet"
                                >
                                  {(handle) => (
                                    <div className="flex items-start gap-2">
                                      <div className="mt-1 shrink-0">{handle}</div>
                                      <textarea
                                        value={bullet.text}
                                        rows={2}
                                        onChange={(e) =>
                                          updateBullet(exp.id, bullet.id, e.target.value)
                                        }
                                        className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeBullet(exp.id, bullet.id)}
                                        aria-label="Remove bullet"
                                        className="mt-1 shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </SortableItem>
                              ))}
                            </div>
                          </SortableList>
                        )}
                      </div>
                    </EntryCard>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
        )}
      </FormSection>

      {/* --- Education ---------------------------------------------------- */}
      <FormSection
        title="Education"
        onAdd={() =>
          update((d) => ({
            ...d,
            education: [
              ...d.education,
              {
                id: newId('edu'),
                institution: '',
                degree: '',
                field: '',
                startDate: '',
                endDate: '',
              },
            ],
          }))
        }
        addLabel="Add education"
      >
        {data.education.length === 0 ? (
          <p className="text-sm text-slate-400">No education yet.</p>
        ) : (
          <div className="space-y-4">
            {data.education.map((edu) => (
              <EntryCard
                key={edu.id}
                onRemove={() =>
                  update((d) => ({
                    ...d,
                    education: d.education.filter((e) => e.id !== edu.id),
                  }))
                }
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField
                    label="Institution"
                    value={edu.institution}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        education: d.education.map((e) =>
                          e.id === edu.id ? { ...e, institution: v } : e,
                        ),
                      }))
                    }
                  />
                  <TextField
                    label="Degree"
                    value={edu.degree}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        education: d.education.map((e) =>
                          e.id === edu.id ? { ...e, degree: v } : e,
                        ),
                      }))
                    }
                  />
                  <TextField
                    label="Field of study"
                    value={edu.field}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        education: d.education.map((e) =>
                          e.id === edu.id ? { ...e, field: v } : e,
                        ),
                      }))
                    }
                  />
                  <TextField
                    label="GPA"
                    value={edu.gpa ?? ''}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        education: d.education.map((e) =>
                          e.id === edu.id ? { ...e, gpa: v } : e,
                        ),
                      }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Start"
                      value={edu.startDate}
                      onChange={(v) =>
                        update((d) => ({
                          ...d,
                          education: d.education.map((e) =>
                            e.id === edu.id ? { ...e, startDate: v } : e,
                          ),
                        }))
                      }
                    />
                    <TextField
                      label="End"
                      value={edu.endDate}
                      onChange={(v) =>
                        update((d) => ({
                          ...d,
                          education: d.education.map((e) =>
                            e.id === edu.id ? { ...e, endDate: v } : e,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
              </EntryCard>
            ))}
          </div>
        )}
      </FormSection>

      {/* --- Skills (categorized) ---------------------------------------- */}
      <FormSection
        title="Skills"
        description="Grouped by category. Enter skills as a comma-separated list."
        onAdd={() =>
          update((d) => ({
            ...d,
            skills: [...d.skills, { id: newId('skill'), name: '', skills: [] }],
          }))
        }
        addLabel="Add category"
      >
        {data.skills.length === 0 ? (
          <p className="text-sm text-slate-400">No skills yet.</p>
        ) : (
          <div className="space-y-4">
            {data.skills.map((cat) => (
              <EntryCard
                key={cat.id}
                onRemove={() =>
                  update((d) => ({
                    ...d,
                    skills: d.skills.filter((c) => c.id !== cat.id),
                  }))
                }
              >
                <TextField
                  label="Category name"
                  value={cat.name}
                  onChange={(v) =>
                    update((d) => ({
                      ...d,
                      skills: d.skills.map((c) =>
                        c.id === cat.id ? { ...c, name: v } : c,
                      ),
                    }))
                  }
                />
                <TextField
                  label="Skills (comma-separated)"
                  value={cat.skills.join(', ')}
                  onChange={(v) =>
                    update((d) => ({
                      ...d,
                      skills: d.skills.map((c) =>
                        c.id === cat.id
                          ? {
                              ...c,
                              skills: v
                                .split(',')
                                .map((s) => s.trim())
                                .filter((s) => s.length > 0),
                            }
                          : c,
                      ),
                    }))
                  }
                />
              </EntryCard>
            ))}
          </div>
        )}
      </FormSection>

      {/* --- Projects ----------------------------------------------------- */}
      <FormSection
        title="Projects"
        onAdd={() =>
          update((d) => ({
            ...d,
            projects: [
              ...d.projects,
              {
                id: newId('proj'),
                name: '',
                description: '',
                bullets: [],
                techStack: [],
              },
            ],
          }))
        }
        addLabel="Add project"
      >
        {data.projects.length === 0 ? (
          <p className="text-sm text-slate-400">No projects yet.</p>
        ) : (
          <div className="space-y-4">
            {data.projects.map((proj) => (
              <EntryCard
                key={proj.id}
                onRemove={() =>
                  update((d) => ({
                    ...d,
                    projects: d.projects.filter((p) => p.id !== proj.id),
                  }))
                }
              >
                <TextField
                  label="Name"
                  value={proj.name}
                  onChange={(v) =>
                    update((d) => ({
                      ...d,
                      projects: d.projects.map((p) =>
                        p.id === proj.id ? { ...p, name: v } : p,
                      ),
                    }))
                  }
                />
                <TextAreaField
                  label="Description"
                  value={proj.description}
                  onChange={(v) =>
                    update((d) => ({
                      ...d,
                      projects: d.projects.map((p) =>
                        p.id === proj.id ? { ...p, description: v } : p,
                      ),
                    }))
                  }
                />
                <TextField
                  label="Tech stack (comma-separated)"
                  value={proj.techStack.join(', ')}
                  onChange={(v) =>
                    update((d) => ({
                      ...d,
                      projects: d.projects.map((p) =>
                        p.id === proj.id
                          ? {
                              ...p,
                              techStack: v
                                .split(',')
                                .map((s) => s.trim())
                                .filter((s) => s.length > 0),
                            }
                          : p,
                      ),
                    }))
                  }
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">Bullets</span>
                    <button
                      type="button"
                      onClick={() =>
                        update((d) => ({
                          ...d,
                          projects: d.projects.map((p) =>
                            p.id === proj.id
                              ? { ...p, bullets: [...p.bullets, { id: newId('bullet'), text: '' }] }
                              : p,
                          ),
                        }))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                    >
                      Add bullet
                    </button>
                  </div>
                  {proj.bullets.length === 0 ? (
                    <p className="text-xs text-slate-400">No bullets yet.</p>
                  ) : (
                    <SortableList
                      ids={proj.bullets.map((b) => b.id)}
                      onReorder={(from, to) => reorderProjectBullets(proj.id, from, to)}
                    >
                      <div className="space-y-2">
                        {proj.bullets.map((bullet) => (
                          <SortableItem
                            key={bullet.id}
                            id={bullet.id}
                            handleLabel="Reorder bullet"
                          >
                            {(handle) => (
                              <div className="flex items-start gap-2">
                                <div className="mt-1 shrink-0">{handle}</div>
                                <textarea
                                  value={bullet.text}
                                  rows={2}
                                  onChange={(e) =>
                                    update((d) => ({
                                      ...d,
                                      projects: d.projects.map((p) =>
                                        p.id === proj.id
                                          ? {
                                              ...p,
                                              bullets: p.bullets.map((b) =>
                                                b.id === bullet.id
                                                  ? { ...b, text: e.target.value }
                                                  : b,
                                              ),
                                            }
                                          : p,
                                      ),
                                    }))
                                  }
                                  className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  aria-label="Remove bullet"
                                  onClick={() =>
                                    update((d) => ({
                                      ...d,
                                      projects: d.projects.map((p) =>
                                        p.id === proj.id
                                          ? {
                                              ...p,
                                              bullets: p.bullets.filter((b) => b.id !== bullet.id),
                                            }
                                          : p,
                                      ),
                                    }))
                                  }
                                  className="mt-1 shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </SortableItem>
                        ))}
                      </div>
                    </SortableList>
                  )}
                </div>
              </EntryCard>
            ))}
          </div>
        )}
      </FormSection>

      {/* --- Certifications ----------------------------------------------- */}
      <FormSection
        title="Certifications"
        onAdd={() =>
          update((d) => ({
            ...d,
            certifications: [...d.certifications, { id: newId('cert'), name: '' }],
          }))
        }
        addLabel="Add certification"
      >
        {data.certifications.length === 0 ? (
          <p className="text-sm text-slate-400">No certifications yet.</p>
        ) : (
          <div className="space-y-4">
            {data.certifications.map((cert) => (
              <EntryCard
                key={cert.id}
                onRemove={() =>
                  update((d) => ({
                    ...d,
                    certifications: d.certifications.filter((c) => c.id !== cert.id),
                  }))
                }
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextField
                    label="Name"
                    value={cert.name}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        certifications: d.certifications.map((c) =>
                          c.id === cert.id ? { ...c, name: v } : c,
                        ),
                      }))
                    }
                  />
                  <TextField
                    label="Issuer"
                    value={cert.issuer ?? ''}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        certifications: d.certifications.map((c) =>
                          c.id === cert.id ? { ...c, issuer: v } : c,
                        ),
                      }))
                    }
                  />
                  <TextField
                    label="Date"
                    value={cert.date ?? ''}
                    onChange={(v) =>
                      update((d) => ({
                        ...d,
                        certifications: d.certifications.map((c) =>
                          c.id === cert.id ? { ...c, date: v } : c,
                        ),
                      }))
                    }
                  />
                </div>
              </EntryCard>
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}
