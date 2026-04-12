import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

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

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits credentials and navigates on success', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({ user: { email: 'test@example.com' } });

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockClientFetch).toHaveBeenCalledWith(
      '/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(401, 'Invalid credentials'));

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password-10');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });
});
