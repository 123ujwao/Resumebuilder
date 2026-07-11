import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS } from '../../store/resumeStore';
import {
  getTemplate,
  hasTemplate,
  implementedTemplates,
  TEMPLATE_REGISTRY,
} from './registry';

/**
 * Registry tests (Req 3.1, 3.5).
 *
 * The registry must return a renderer per implemented id, and resolving any
 * built-in id must always yield a usable renderer (fallback for not-yet-built
 * templates from Task 5.2).
 */
describe('template registry', () => {
  it('returns a renderer for every built-in template id (all 5)', () => {
    for (const id of TEMPLATE_IDS) {
      expect(hasTemplate(id)).toBe(true);
      const def = getTemplate(id);
      expect(def.id).toBe(id);
      expect(typeof def.ScreenComponent).toBe('function');
    }
  });

  it('exposes exactly the five implemented definitions', () => {
    const impl = implementedTemplates();
    expect(impl.map((t) => t.id).sort()).toEqual(
      ['classic', 'compact', 'minimal', 'modern', 'two-column'],
    );
  });

  it('only registers renderers for known built-in template ids', () => {
    for (const id of Object.keys(TEMPLATE_REGISTRY)) {
      expect(TEMPLATE_IDS).toContain(id);
    }
  });
});
