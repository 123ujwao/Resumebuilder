import type { FC } from 'react';
import type { ResumeData } from '@resume-forge/core';
import type { TemplateId, TemplateSelection } from '../../store/resumeStore';

/**
 * Template rendering abstraction (Req 3.1, 3.4, 3.5).
 *
 * Every template renders the *same* {@link ResumeData}. A template is described
 * by a {@link TemplateDefinition}, and the registry maps a `templateId` to its
 * definition. Because all templates consume identical inputs, switching the
 * selected template swaps only the renderer over the same underlying data —
 * there is no data transformation and therefore no data loss (Req 3.5).
 *
 * Extensibility
 * -------------
 * For this task we implement the on-screen HTML/Tailwind renderer path
 * (`ScreenComponent`). The abstraction is intentionally open: a future
 * `PdfComponent` (Task 9, react-pdf primitives) can be added to
 * {@link TemplateDefinition} as an optional field without changing any caller,
 * since callers select a template via {@link getTemplate} and render whichever
 * surface they need.
 */

/**
 * Styling knobs applied to a template, derived from the store's template
 * selection. `font` is a font-family choice and `accentColor` is a hex color
 * from the safe palette. Full style controls (font/color pickers) land in
 * Task 5.2; templates already consume these so that work is drop-in.
 */
export interface TemplateStyle {
  font: string;
  accentColor: string;
}

/** Props every on-screen template component receives. */
export interface TemplateComponentProps {
  data: ResumeData;
  style: TemplateStyle;
}

/** The on-screen (HTML/Tailwind) renderer for a template. */
export type TemplateScreenComponent = FC<TemplateComponentProps>;

/**
 * A single template's definition. `ScreenComponent` renders the resume to the
 * screen. A `PdfComponent` can be added later (Task 9) without breaking callers.
 */
export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  ScreenComponent: TemplateScreenComponent;
}

/** Derive the {@link TemplateStyle} from the store's template selection. */
export function styleFromSelection(selection: TemplateSelection): TemplateStyle {
  return { font: selection.font, accentColor: selection.accentColor };
}

/**
 * Map a safe font choice to a concrete CSS font-family stack. Unknown values
 * fall back to the provided default stack, so each template can pick a sensible
 * serif/sans default while still honoring an explicit user font (Task 5.2).
 */
export const FONT_STACKS: Record<string, string> = {
  Inter: "'Inter', system-ui, -apple-system, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Roboto: "'Roboto', system-ui, sans-serif",
};

export function fontFamily(font: string, fallback: string): string {
  return FONT_STACKS[font] ?? fallback;
}

export const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
export const SANS_FALLBACK = "'Inter', system-ui, -apple-system, sans-serif";
