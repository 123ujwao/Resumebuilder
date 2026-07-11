import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeySettings } from './ApiKeySettings';
import { API_KEY_STORAGE_KEY, useApiKeyStore } from './apiKeyStore';

function reset() {
  cleanup();
  localStorage.clear();
  useApiKeyStore.setState({ apiKey: null, isPromptOpen: false });
}

describe('ApiKeySettings', () => {
  beforeEach(reset);

  it('shows "No key stored" when empty', () => {
    render(<ApiKeySettings />);
    expect(screen.getByText(/no key stored/i)).toBeInTheDocument();
  });

  it('updates the stored key (Req 1.7)', async () => {
    const user = userEvent.setup();
    render(<ApiKeySettings />);

    await user.type(screen.getByLabelText('Add key'), 'sk-ant-fresh');
    await user.click(screen.getByRole('button', { name: /save key/i }));

    expect(useApiKeyStore.getState().apiKey).toBe('sk-ant-fresh');
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBe('sk-ant-fresh');
    expect(screen.getByText(/key stored/i)).toBeInTheDocument();
  });

  it('clears the stored key (Req 1.7)', async () => {
    const user = userEvent.setup();
    useApiKeyStore.setState({ apiKey: 'sk-ant-existing' });
    render(<ApiKeySettings />);

    await user.click(screen.getByRole('button', { name: /clear key/i }));

    expect(useApiKeyStore.getState().apiKey).toBeNull();
    expect(localStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/no key stored/i)).toBeInTheDocument();
  });

  it('does not show a clear button when no key is stored', () => {
    render(<ApiKeySettings />);
    expect(
      screen.queryByRole('button', { name: /clear key/i }),
    ).not.toBeInTheDocument();
  });
});
