import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { formatPrice } from './lib/format';
import { createInitialState } from './store/initialState';

// Testing Library normalises whitespace, so compare with regular spaces instead of NBSP.
const price = (n: number): string => formatPrice(n).replace(/\s/g, ' ');

const visibleModal = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(document.querySelector('.cds--modal.is-visible')).not.toBeNull());
  return document.querySelector<HTMLElement>('.cds--modal.is-visible')!;
};

const stateWith = (patch: Partial<ReturnType<typeof createInitialState>>) => ({ ...createInitialState(), ...patch });

afterEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('theme', () => {
  it('toggles between dark and light and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App initialState={stateWith({})} />);
    expect(document.documentElement).toHaveClass('cds--g100');

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement).toHaveClass('cds--white');
    expect(document.documentElement).not.toHaveClass('cds--g100');
    expect(localStorage.getItem('bookworm:theme')).toBe('light');

    // A fresh load restores the saved theme.
    unmount();
    render(<App initialState={stateWith({})} />);
    expect(document.documentElement).toHaveClass('cds--white');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveClass('cds--g100');
    expect(localStorage.getItem('bookworm:theme')).toBe('dark');
  });
});

describe('catalogue', () => {
  it('shows home sections and filters by category', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({})} />);
    expect(screen.getByRole('heading', { name: 'Recommended for You' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bestsellers this Month' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Launches' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Romance' }));
    expect(await screen.findByRole('heading', { name: /Romance books/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beneath the Stars' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'The Midnight Hour' })).not.toBeInTheDocument();
  });

  it('adds a book to the cart and updates the header badge', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/book/joy-of-minimalism');
    render(<App initialState={stateWith({})} />);
    await user.click(screen.getAllByRole('button', { name: 'Add to Cart' })[0]);
    expect(screen.getAllByRole('button', { name: 'Go to Cart' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cart, 1 items' })).toBeInTheDocument();
  });
});

describe('checkout', () => {
  it('validates the address, takes a card payment and shows the confirmation', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/checkout');
    render(
      <App
        initialState={stateWith({
          user: { name: 'Demo', email: 'demo@example.com' },
          cart: [{ bookId: 'joy-of-minimalism', qty: 1 }, { bookId: 'the-path-to-success', qty: 1 }],
        })}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Pay Now' })[0]);
    expect(await screen.findByText('First name is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText('First Name'), 'Ana');
    await user.type(screen.getByLabelText('Last Name'), 'Popa');
    await user.type(screen.getByLabelText('Address', { selector: 'input' }), 'Strada Victoriei 1');
    await user.type(screen.getByLabelText('City'), 'București');
    await user.type(screen.getByLabelText('Postal code'), '010063');
    await user.type(screen.getByLabelText('Phone Number'), '712345678');
    await user.type(screen.getByLabelText('County'), 'București');

    await user.type(screen.getByLabelText('Apply Coupon'), 'bookworm20');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('BOOKWORM20 applied')).toBeInTheDocument();
    expect(screen.getByText(`-${price(20)}`)).toBeInTheDocument();
    expect(screen.getByText(price(91))).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Pay Now' })[0]);
    const dialog = await visibleModal();
    expect(within(dialog).getByText(`Payable Amount: ${price(91)}`)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Pay Now' }));
    expect(await within(dialog).findByText('Enter a valid card number')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Card Number'), '4111111111111111');
    await user.type(within(dialog).getByLabelText('Name on Card'), 'Ana Popa');
    await user.type(within(dialog).getByLabelText('CVV'), '123');
    await user.type(within(dialog).getByLabelText('Date of Expiry'), '122099');
    await user.click(within(dialog).getByRole('button', { name: 'Pay Now' }));

    await waitFor(
      () => expect(screen.getByText('Your purchase of the following reads is successful')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByRole('button', { name: 'Continue your Shopping' })).toBeInTheDocument();
  });
});

describe('cash on delivery', () => {
  it('places the order without card details', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/checkout');
    render(
      <App
        initialState={stateWith({
          user: { name: 'Demo', email: 'demo@example.com' },
          cart: [{ bookId: 'joy-of-minimalism', qty: 1 }],
        })}
      />,
    );
    await user.type(screen.getByLabelText('First Name'), 'Ana');
    await user.type(screen.getByLabelText('Last Name'), 'Popa');
    await user.type(screen.getByLabelText('Address', { selector: 'input' }), 'Strada Victoriei 1');
    await user.type(screen.getByLabelText('City'), 'Cluj-Napoca');
    await user.type(screen.getByLabelText('Postal code'), '400001');
    await user.type(screen.getByLabelText('Phone Number'), '712345678');
    await user.type(screen.getByLabelText('County'), 'Cluj');
    await user.click(screen.getAllByRole('button', { name: 'Pay Now' })[0]);

    const dialog = await visibleModal();
    await user.click(within(dialog).getByRole('tab', { name: 'Cash on Delivery' }));
    await user.click(within(dialog).getByRole('button', { name: 'Place Order' }));
    await waitFor(
      () => expect(screen.getByText('Your purchase of the following reads is successful')).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });
});

describe('orders', () => {
  it('lets a signed-in user buy again and cancel a recent order', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/orders');
    const base = createInitialState();
    const recent = { ...base.orders[0], id: 'BW-RECENT', number: 'BW-RECENT', status: 'placed' as const, placedAt: new Date().toISOString() };
    render(<App initialState={stateWith({ user: { name: 'Demo', email: 'd@example.com' }, orders: [recent, ...base.orders] })} />);

    expect(screen.getByText('Order BW-RECENT')).toBeInTheDocument();
    expect(screen.getByText(/Free cancellation: 47h/)).toBeInTheDocument();
    // Seeded orders are older than 48h: no cancel button for them.
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel order' });
    expect(cancelButtons).toHaveLength(2); // the order's button + the confirm dialog's primary button

    await user.click(cancelButtons[0]);
    const modal = await visibleModal();
    await user.click(within(modal).getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Buy It Again' })[0]);
    expect(await screen.findByRole('heading', { name: 'Shopping Cart' })).toBeInTheDocument();
  });

  it('asks guests to sign in', () => {
    window.history.pushState({}, '', '/orders');
    render(<App initialState={stateWith({})} />);
    expect(screen.getByText('Sign in to see your order history.')).toBeInTheDocument();
  });
});
