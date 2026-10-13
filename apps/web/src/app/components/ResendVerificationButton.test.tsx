/**
 * @jest-environment jsdom
 */
import { ResendVerificationButton } from './ResendVerificationButton';
import { appClient } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/api-client', () => ({
  appClient: { post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockPost = appClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: {} });
});

it('posts the address to the resend endpoint', async () => {
  renderWithProviders(<ResendVerificationButton email="ada@example.com" />);

  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));

  await waitFor(() =>
    expect(mockPost).toHaveBeenCalledWith('/auth/resend-organization-verification', {
      email: 'ada@example.com',
    })
  );
});

it('words success as "if", since the endpoint never confirms a signup exists', async () => {
  renderWithProviders(<ResendVerificationButton email="ada@example.com" />);

  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));

  await waitFor(() => expect(success).toHaveBeenCalled());
  expect(success.mock.calls[0][1]).toMatch(/^If /);
});

it('cools down after sending so a double-click sends one email', async () => {
  renderWithProviders(<ResendVerificationButton email="ada@example.com" />);

  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));

  const button = await screen.findByRole('button', { name: /Resend in \d+s/ });
  expect(button).toBeDisabled();
  expect(mockPost).toHaveBeenCalledTimes(1);
});

it('shows the server reason and stays usable when refused', async () => {
  mockPost.mockRejectedValueOnce(new Error('Too many requests. Try again shortly.'));
  renderWithProviders(<ResendVerificationButton email="ada@example.com" />);

  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }));

  expect(await screen.findByText('Too many requests. Try again shortly.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resend link' })).toBeEnabled();
  expect(error).toHaveBeenCalled();
});
