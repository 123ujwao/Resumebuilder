import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StyleControls } from './StyleControls';
import {
  useResumeStore,
  createBaseVersion,
  createEmptyResume,
  DEFAULT_TEMPLATE,
  ACCENT_COLORS,
  FONT_OPTIONS,
} from '../../store/resumeStore';

/**
 * StyleControls tests (Req 3.6): font picker + safe-palette accent picker wired
 * to the store.
 */

function resetStore() {
  cleanup();
  localStorage.clear();
  const base = createBaseVersion(createEmptyResume());
  useResumeStore.setState({
    versions: [base],
    activeVersionId: base.id,
    template: { ...DEFAULT_TEMPLATE },
  });
}

describe('StyleControls', () => {
  beforeEach(resetStore);

  it('changing the font updates the store', async () => {
    const user = userEvent.setup();
    render(<StyleControls />);

    const target = FONT_OPTIONS[1]; // e.g. 'Georgia'
    await user.selectOptions(screen.getByLabelText('Font'), target);

    expect(useResumeStore.getState().template.font).toBe(target);
  });

  it('offers a limited safe palette of accent swatches, not a free-form input', () => {
    render(<StyleControls />);
    const swatches = screen.getAllByRole('radio');
    expect(swatches).toHaveLength(ACCENT_COLORS.length);
    // No free-form color input is rendered.
    expect(
      document.querySelector('input[type="color"]'),
    ).toBeNull();
  });

  it('selecting an accent swatch updates the store', async () => {
    const user = userEvent.setup();
    render(<StyleControls />);

    const target = ACCENT_COLORS[2];
    await user.click(screen.getByLabelText(`Accent color ${target}`));

    expect(useResumeStore.getState().template.accentColor).toBe(target);
  });
});
