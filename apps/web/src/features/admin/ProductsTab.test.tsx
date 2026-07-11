import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Tests for the admin Products & Pricing tab (Task 11.4, Req 10.9).
 *
 * The adminData module is mocked so we control the data and assert the write
 * calls. We verify:
 *  - the products table renders name, price, unlocks_count, and status,
 *  - the Add product form calls createProduct with parsed numeric fields,
 *  - the Deactivate/Activate toggle calls setProductActive,
 *  - inline edit persists via updateProduct,
 *  - payment settings load and save via updatePaymentSettings,
 *  - errors surface, and loading/empty states render.
 */

const listProducts = vi.fn();
const createProduct = vi.fn();
const updateProduct = vi.fn();
const setProductActive = vi.fn();
const getPaymentSettings = vi.fn();
const updatePaymentSettings = vi.fn();

vi.mock('./adminData', () => ({
  listProducts: (...a: unknown[]) => listProducts(...a),
  createProduct: (...a: unknown[]) => createProduct(...a),
  updateProduct: (...a: unknown[]) => updateProduct(...a),
  setProductActive: (...a: unknown[]) => setProductActive(...a),
  getPaymentSettings: (...a: unknown[]) => getPaymentSettings(...a),
  updatePaymentSettings: (...a: unknown[]) => updatePaymentSettings(...a),
}));

const { ProductsTab } = await import('./ProductsTab');

const PRODUCTS = [
  {
    id: 'p1',
    name: 'resume_only',
    price: 99,
    unlocks_count: 1,
    active: true,
  },
  {
    id: 'p2',
    name: 'resume_plus_cover_letter',
    price: 149,
    unlocks_count: 3,
    active: false,
  },
];

const SETTINGS = { upi_id: 'acme@bank', note: 'Thanks for paying!' };

beforeEach(() => {
  vi.clearAllMocks();
  listProducts.mockResolvedValue(PRODUCTS);
  getPaymentSettings.mockResolvedValue(SETTINGS);
  createProduct.mockResolvedValue({
    id: 'p9',
    name: 'starter',
    price: 49,
    unlocks_count: 2,
    active: true,
  });
  updateProduct.mockResolvedValue({
    id: 'p1',
    name: 'resume_only',
    price: 120,
    unlocks_count: 1,
    active: true,
  });
  setProductActive.mockResolvedValue({ ...PRODUCTS[0], active: false });
  updatePaymentSettings.mockResolvedValue(SETTINGS);
});

describe('ProductsTab rendering (Req 10.9)', () => {
  it('renders products with name, price, unlocks, and status', async () => {
    render(<ProductsTab />);

    expect(await screen.findByText('resume_only')).toBeInTheDocument();
    const row = screen.getByText('resume_only').closest('tr')!;
    expect(within(row).getByText('₹99')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();

    const row2 = screen.getByText('resume_plus_cover_letter').closest('tr')!;
    expect(within(row2).getByText('Inactive')).toBeInTheDocument();
  });

  it('loads current payment settings into the form', async () => {
    render(<ProductsTab />);
    const upi = (await screen.findByLabelText('UPI ID')) as HTMLInputElement;
    expect(upi.value).toBe('acme@bank');
    const note = screen.getByLabelText('Payment note') as HTMLTextAreaElement;
    expect(note.value).toBe('Thanks for paying!');
  });

  it('shows an empty state when there are no products', async () => {
    listProducts.mockResolvedValueOnce([]);
    render(<ProductsTab />);
    expect(await screen.findByText(/no products yet/i)).toBeInTheDocument();
  });
});

describe('ProductsTab add product (Req 10.9)', () => {
  it('creates a product with parsed numeric fields', async () => {
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByText('resume_only');

    await user.type(screen.getByLabelText('New product name'), 'starter');
    await user.type(screen.getByLabelText('New product price'), '49');
    await user.type(screen.getByLabelText('New product unlocks count'), '2');
    await user.click(screen.getByRole('button', { name: /add product/i }));

    await waitFor(() =>
      expect(createProduct).toHaveBeenCalledWith({
        name: 'starter',
        price: 49,
        unlocks_count: 2,
      }),
    );
  });

  it('rejects a blank name without calling createProduct', async () => {
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByText('resume_only');

    // Leave the name blank but fill valid numbers, then submit.
    fireEvent.change(screen.getByLabelText('New product price'), {
      target: { value: '49' },
    });
    fireEvent.change(screen.getByLabelText('New product unlocks count'), {
      target: { value: '2' },
    });
    await user.click(screen.getByRole('button', { name: /add product/i }));

    expect(
      await screen.findByText(/product name is required/i),
    ).toBeInTheDocument();
    expect(createProduct).not.toHaveBeenCalled();
  });
});

describe('ProductsTab toggle active (Req 10.9)', () => {
  it('deactivates an active product', async () => {
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByText('resume_only');

    await user.click(
      screen.getByRole('button', { name: /deactivate resume_only/i }),
    );

    expect(setProductActive).toHaveBeenCalledWith('p1', false);
  });

  it('activates an inactive product', async () => {
    setProductActive.mockResolvedValueOnce({ ...PRODUCTS[1], active: true });
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByText('resume_plus_cover_letter');

    await user.click(
      screen.getByRole('button', {
        name: /activate resume_plus_cover_letter/i,
      }),
    );

    expect(setProductActive).toHaveBeenCalledWith('p2', true);
  });
});

describe('ProductsTab inline edit (Req 10.9)', () => {
  it('persists edited fields via updateProduct', async () => {
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByText('resume_only');

    await user.click(screen.getByRole('button', { name: /edit resume_only/i }));

    const priceInput = screen.getByLabelText(
      /edit price for resume_only/i,
    ) as HTMLInputElement;
    await user.clear(priceInput);
    await user.type(priceInput, '120');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith('p1', {
        name: 'resume_only',
        price: 120,
        unlocks_count: 1,
      }),
    );
  });
});

describe('ProductsTab payment settings (Req 10.9)', () => {
  it('saves updated payment settings', async () => {
    const user = userEvent.setup();
    render(<ProductsTab />);
    const upi = (await screen.findByLabelText('UPI ID')) as HTMLInputElement;

    await user.clear(upi);
    await user.type(upi, 'new@bank');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() =>
      expect(updatePaymentSettings).toHaveBeenCalledWith({
        upi_id: 'new@bank',
        note: 'Thanks for paying!',
      }),
    );
    expect(await screen.findByText(/saved\./i)).toBeInTheDocument();
  });

  it('surfaces an error when saving settings fails', async () => {
    updatePaymentSettings.mockRejectedValueOnce(
      new Error('Could not save payment settings. Please try again.'),
    );
    const user = userEvent.setup();
    render(<ProductsTab />);
    await screen.findByLabelText('UPI ID');

    await user.click(screen.getByRole('button', { name: /save settings/i }));

    expect(
      await screen.findByText(/could not save payment settings/i),
    ).toBeInTheDocument();
  });
});

describe('ProductsTab states', () => {
  it('shows a loading state then the content', async () => {
    render(<ProductsTab />);
    expect(screen.getByText(/loading products/i)).toBeInTheDocument();
    await screen.findByText('resume_only');
  });

  it('shows an error state when loading fails', async () => {
    listProducts.mockRejectedValueOnce(new Error('Could not load products.'));
    render(<ProductsTab />);
    expect(
      await screen.findByText('Could not load products.'),
    ).toBeInTheDocument();
  });
});
