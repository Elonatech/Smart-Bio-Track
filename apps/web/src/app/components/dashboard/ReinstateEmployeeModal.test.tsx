/**
 * @jest-environment jsdom
 */
import { ReinstateEmployeeModal } from './ReinstateEmployeeModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Bringing a removed employee back (#23, reachable as of #31).
 *
 * The copy carries unusual weight here. "Reinstate" reads as *undo*, and it is
 * closer to *re-hire*: the old password is destroyed server-side and the person
 * starts from a new invitation. An admin who expects the account to come back
 * as it was will report the emailed link as a bug, so the modal says what
 * actually happens and there are tests on that saying.
 */

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

const employee = {
  id: 'u42',
  employeeId: 'EMP-0042',
  name: 'Bola Eze',
  email: 'bola@example.com',
};

function renderModal() {
  const onClose = jest.fn();
  const onReinstated = jest.fn();
  render(
    <ReinstateEmployeeModal
      employee={employee}
      onClose={onClose}
      onReinstated={onReinstated}
    />
  );
  return { onClose, onReinstated };
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
});

describe('ReinstateEmployeeModal', () => {
  it('names the person, with both identifiers', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Reinstate Bola Eze?' })).toBeInTheDocument();
    expect(screen.getByText(/bola@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMP-0042/)).toBeInTheDocument();
  });

  it('posts to the reinstate endpoint and refreshes the list', async () => {
    const { onClose, onReinstated } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/users/u42/reinstate', {}));
    expect(onReinstated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(success).toHaveBeenCalled();
  });

  it('sends nothing on Cancel', async () => {
    const { onClose, onReinstated } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(onReinstated).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends nothing when dismissed', async () => {
    const { onClose, onReinstated } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(onReinstated).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the super-admin refusal rather than failing silently', async () => {
    // An HR admin should never see the button — the toggle that surfaces
    // removed staff is super-admin only. If they reach it anyway, the server's
    // wording is better than a generic failure.
    mockPost.mockRejectedValueOnce(
      new Error('Only an organization super admin may reinstate a removed employee.')
    );
    const { onClose, onReinstated } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    expect(
      await screen.findByText(
        'Only an organization super admin may reinstate a removed employee.'
      )
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(onReinstated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-enables the button after a failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Reinstate' })).toBeEnabled();
  });

  describe('the copy matches what the server does', () => {
    it('says a new invitation is sent', () => {
      renderModal();
      expect(screen.getByText(/new invitation/i)).toBeInTheDocument();
    });

    it('warns that the previous password stops working', () => {
      // The server nulls passwordHash. An admin who tells the returning
      // employee "just use your old password" is passing on a promise the
      // system deliberately broke.
      renderModal();
      expect(screen.getByText(/previous password will no longer work/i)).toBeInTheDocument();
    });

    it('does not describe this as restoring the old account', () => {
      renderModal();
      expect(screen.queryByText(/restore their (previous )?access/i)).not.toBeInTheDocument();
    });

    it('says the history stays attached to the same record', () => {
      // The reason reinstating beats creating a second person with the same
      // name: attendance and pay history survives on the original row.
      renderModal();
      expect(screen.getByText(/attendance and payroll history is still attached/i)).toBeInTheDocument();
    });
  });
});
