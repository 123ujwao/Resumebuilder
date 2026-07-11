import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRequireApiKey } from './useRequireApiKey';
import { useApiKeyStore } from './apiKeyStore';

/**
 * Verifies the AI-action guard (Req 1.5): blocks and opens the prompt when no
 * key exists, and returns the key when one is stored.
 */

function Harness({ onResult }: { onResult: (key: string | null) => void }) {
  const ensureApiKey = useRequireApiKey();
  return (
    <button type="button" onClick={() => onResult(ensureApiKey())}>
      run
    </button>
  );
}

function reset() {
  cleanup();
  localStorage.clear();
  useApiKeyStore.setState({ apiKey: null, isPromptOpen: false });
}

describe('useRequireApiKey', () => {
  beforeEach(reset);

  it('opens the prompt and returns null when no key is stored (Req 1.5)', async () => {
    const user = userEvent.setup();
    let result: string | null = 'unset';
    render(<Harness onResult={(k) => (result = k)} />);

    await user.click(screen.getByRole('button', { name: 'run' }));

    expect(result).toBeNull();
    expect(useApiKeyStore.getState().isPromptOpen).toBe(true);
  });

  it('returns the key and does not open the prompt when a key exists', async () => {
    const user = userEvent.setup();
    useApiKeyStore.setState({ apiKey: 'sk-ant-stored' });
    let result: string | null = null;
    render(<Harness onResult={(k) => (result = k)} />);

    await user.click(screen.getByRole('button', { name: 'run' }));

    expect(result).toBe('sk-ant-stored');
    expect(useApiKeyStore.getState().isPromptOpen).toBe(false);
  });
});
