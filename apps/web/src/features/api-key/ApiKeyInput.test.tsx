import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ApiKeyInput } from './ApiKeyInput';

/** Controlled wrapper so typing updates the rendered value. */
function Harness() {
  const [value, setValue] = useState('');
  return <ApiKeyInput value={value} onChange={setValue} />;
}

describe('ApiKeyInput', () => {
  beforeEach(cleanup);

  it('masks the key as a password field by default (Req 1.3)', () => {
    render(<ApiKeyInput value="sk-ant-secret" onChange={() => {}} />);
    const input = screen.getByLabelText('Anthropic API key');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('toggles visibility with the show/hide button (Req 1.3)', async () => {
    const user = userEvent.setup();
    render(<ApiKeyInput value="sk-ant-secret" onChange={() => {}} />);
    const input = screen.getByLabelText('Anthropic API key');

    const toggle = screen.getByRole('button', { name: /show api key/i });
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');

    const hideToggle = screen.getByRole('button', { name: /hide api key/i });
    await user.click(hideToggle);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('reports typed characters through onChange', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Anthropic API key');
    await user.type(input, 'sk-ant-xyz');
    expect(input).toHaveValue('sk-ant-xyz');
  });

  it('calls onChange for each keystroke', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ApiKeyInput value="" onChange={onChange} />);
    await user.type(screen.getByLabelText('Anthropic API key'), 'ab');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
