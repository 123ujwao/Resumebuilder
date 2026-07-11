import {
  useResumeStore,
  FONT_OPTIONS,
  ACCENT_COLORS,
} from '../../store/resumeStore';
import { fontFamily, SANS_FALLBACK } from './types';

/**
 * Style controls (Req 3.6): a font picker and a safe-palette accent color picker.
 *
 * Both controls are wired to the store (`setFont` / `setAccentColor`) so any
 * change flows through the template selection and is reflected in the live
 * preview (and later, export). The color picker is intentionally a set of
 * fixed swatches from {@link ACCENT_COLORS} — a limited *safe palette* — rather
 * than a free-form `<input type="color">`, so users can only pick vetted,
 * legible accent colors (Req 3.6).
 */
export function StyleControls() {
  const font = useResumeStore((s) => s.template.font);
  const accentColor = useResumeStore((s) => s.template.accentColor);
  const setFont = useResumeStore((s) => s.setFont);
  const setAccentColor = useResumeStore((s) => s.setAccentColor);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">Font</span>
        <select
          aria-label="Font"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: fontFamily(f, SANS_FALLBACK) }}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <div
        className="flex items-center gap-2 text-sm"
        role="radiogroup"
        aria-label="Accent color"
      >
        <span className="text-slate-600">Accent</span>
        <div className="flex items-center gap-1.5">
          {ACCENT_COLORS.map((color) => {
            const selected = color === accentColor;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Accent color ${color}`}
                title={color}
                onClick={() => setAccentColor(color)}
                className={`h-6 w-6 rounded-full border transition ${
                  selected
                    ? 'border-slate-900 ring-2 ring-slate-400 ring-offset-1'
                    : 'border-slate-300'
                }`}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
