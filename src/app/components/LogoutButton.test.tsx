import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './LogoutButton';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const mockClientFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
  ApiFetchError: class ApiFetchError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiFetchError';
      this.status = status;
    }
  },
}));

describe('LogoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a sign out button', () => {
    render(<LogoutButton />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls sign-out endpoint and navigates on click', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({});

    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockClientFetch).toHaveBeenCalledWith(
      '/api/auth/sign-out',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed sign-out', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(500, 'Server error'));

    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });
});
