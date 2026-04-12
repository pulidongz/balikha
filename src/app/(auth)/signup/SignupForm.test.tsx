import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from './SignupForm';

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

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the signup form fields', () => {
    render(<SignupForm />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('submits form data and navigates on success', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({ user: { email: 'new@example.com' } });

    render(<SignupForm />);

    await user.type(screen.getByLabelText('Name'), 'New User');
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockClientFetch).toHaveBeenCalledWith(
      '/api/auth/sign-up/email',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed signup', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(400, 'Email already exists'));

    render(<SignupForm />);

    await user.type(screen.getByLabelText('Name'), 'Existing');
    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already exists');
  });
});
