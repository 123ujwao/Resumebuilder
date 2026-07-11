import type { ReactNode } from 'react';

/**
 * Small presentational form primitives shared by the editable resume form.
 *
 * They are intentionally thin wrappers over native inputs so every field stays
 * fully editable and keyboard/screen-reader accessible (Req 2.3). Styling is
 * Tailwind; behaviour is controlled by the parent via `value`/`onChange`.
 */

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

export function TextField({ label, value, onChange, placeholder, type = 'text' }: TextFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function TextAreaField({ label, value, onChange, placeholder, rows = 3 }: TextAreaFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-y`}
      />
    </label>
  );
}

export interface FormSectionProps {
  title: string;
  description?: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}

/** A titled section with an optional "add entry" action. */
export function FormSection({ title, description, onAdd, addLabel, children }: FormSectionProps) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {addLabel ?? 'Add'}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export interface EntryCardProps {
  onRemove: () => void;
  removeLabel?: string;
  /** Optional drag handle rendered in the card header (Task 4.3). */
  handle?: ReactNode;
  children: ReactNode;
}

/** A card wrapping a single repeatable entry (experience item, project, etc.). */
export function EntryCard({ onRemove, removeLabel = 'Remove', handle, children }: EntryCardProps) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      {handle && <div className="flex justify-start">{handle}</div>}
      <div className="space-y-3">{children}</div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          {removeLabel}
        </button>
      </div>
    </div>
  );
}
