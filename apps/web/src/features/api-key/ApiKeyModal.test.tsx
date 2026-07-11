import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeyModal } from './ApiKeyModal';
import {
  ANTHROPIC_API_KEYS_HELP_URL,
  API_KEY_STORAGE_KEY,
  useApiKeyStore,
} from './apiKeyStore';

function reset() {
  cleanup();
  localStorage.clear();
  useApiKeyStore.setState({ apiKey: null, isPromptOpen: false });
}

describe('ApiKeyModal', () => {
  beforeEach(reset);

  it('opens automatically on first load when no key is stored (Req 1.1)', () => {
    render(<ApiKeyModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /add your anthropic api key/i }),
    ).toBeInTheDocument();
  });

  it('does not open on load when a key is already stored', () => {
    useApiKeyStore.setState({ apiKey: 'sk-ant-existing' });
    render(<ApiKeyModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a help link for obtaining a key (Req 1.4)', () => {
    render(<ApiKeyModal />);
    const link = screen.getByRole('link', { name: /anthropic console/i });
    expect(link).toHaveAttribute('href', ANTHROPIC_API_KEYS_HELP_URL);
  });

  it('saves the entered key to localStorage and closes (Req 1.2, 1.5)', async () => {
    const user = userEvent.setup();
    render(<ApiKeyModal />);

    await user.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-new');
    await user.click(screen.getByRole('button', { name: /save key/i }));

    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-ant-new');
    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables save until a non-empty key is entered', async () => {
    render(<ApiKeyModal />);
    const saveButton = screen.getByRole('button', { name: /save key/i });
    expect(saveButton).toBeDisabled();
  });

  it('offers a cancel action only when a key already exists', async () => {
    const user = userEvent.setup();
    // No key: no cancel button (user must add a key to proceed).
    render(<ApiKeyModal />);
    expect(
      screen.queryByRole('button', { name: /cancel/i }),
    ).not.toBeInTheDocument();

    // With a key and prompt re-opened: cancel is available.
    reset();
    useApiKeyStore.setState({ apiKey: 'sk-ant-existing', isPromptOpen: true });
    render(<ApiKeyModal />);
    const cancel = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancel);
    expect(useApiKeyStore.getState().isPromptOpen).toBe(false);
    // Key unchanged.
    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-existing');
  });
});
