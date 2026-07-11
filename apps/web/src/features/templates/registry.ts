import type { TemplateId } from '../../store/resumeStore';
import type { TemplateDefinition } from './types';
import { ClassicTemplate } from './ClassicTemplate';
import { ModernTemplate } from './ModernTemplate';
import { CompactTemplate } from './CompactTemplate';
import { TwoColumnTemplate } from './TwoColumnTemplate';
import { MinimalTemplate } from './MinimalTemplate';

/**
 * Template registry (Req 3.1, 3.5).
 *
 * Maps a `templateId` to its {@link TemplateDefinition}. Callers resolve a
 * renderer by id, so switching templates simply swaps the definition over the
 * same {@link ResumeData} — no data transformation, no data loss (Req 3.5).
 *
 * All five templates are registered here. Callers resolve a renderer by id, so
 * enabling a template is just a matter of having its definition in this map.
 */
export const TEMPLATE_REGISTRY: Partial<Record<TemplateId, TemplateDefinition>> = {
  classic: { id: 'classic', name: 'Classic', ScreenComponent: ClassicTemplate },
  modern: { id: 'modern', name: 'Modern', ScreenComponent: ModernTemplate },
  compact: { id: 'compact', name: 'Compact', ScreenComponent: CompactTemplate },
  'two-column': {
    id: 'two-column',
    name: 'Two-column',
    ScreenComponent: TwoColumnTemplate,
  },
  minimal: { id: 'minimal', name: 'Minimal', ScreenComponent: MinimalTemplate },
};

/** Default template used when a requested id has no registered renderer yet. */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'classic';

/** True when a renderer is registered for the given id. */
export function hasTemplate(id: TemplateId): boolean {
  return Boolean(TEMPLATE_REGISTRY[id]);
}

/**
 * Resolve the {@link TemplateDefinition} for an id, falling back to the default
 * template when the requested id isn't implemented yet (e.g. a template only
 * added in Task 5.2). Guarantees callers always receive a renderer.
 */
export function getTemplate(id: TemplateId): TemplateDefinition {
  return TEMPLATE_REGISTRY[id] ?? TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID]!;
}

/** All currently-implemented template definitions, for building switchers. */
export function implementedTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(
    (t): t is TemplateDefinition => Boolean(t),
  );
}
