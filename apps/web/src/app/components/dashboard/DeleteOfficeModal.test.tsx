/**
 * @jest-environment jsdom
 */
import { DeleteOfficeModal } from './DeleteOfficeModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Deleting an office (#27).
 *
 * An office is a geo-fence, so deleting one does not just remove a row from a
 * list — it removes the boundary that assigned staff clock in against. The
 * consequence lands on people who had nothing to do with the click, and it
 * lands in Phase 3 rather than immediately, which is exactly the kind of delay
 * that makes a warning worth testing.
 *
 * The modal also closes on a backdrop click, which is convenient on every
 * other screen and worth knowing about on a destructive one.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { delete: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockDelete = appClient.delete as jest.Mock;

const OFFICE = {
  id: 'office-1',
  name: 'Lagos HQ',
  latitude: 6.5244,
  longitude: 3.3792,
  geofenceRadiusMeters: 150,
};

function renderModal() {
  const onClose = jest.fn();
  const onDeleted = jest.fn();
  render(
    <DeleteOfficeModal office={OFFICE} onClose={onClose} onDeleted={onDeleted} />
  );
  return { onClose, onDeleted };
}

const confirm = () =>
  userEvent.click(screen.getByRole('button', { name: 'Delete office' }));

beforeEach(() => {
  mockDelete.mockResolvedValue({ data: {} });
});

describe('deleting', () => {
  it('DELETEs the right office and refreshes the list', async () => {
    const { onClose, onDeleted } = renderModal();

    await confirm();

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/offices/office-1'));
    expect(onDeleted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('names the office being deleted', () => {
    renderModal();

    expect(screen.getByText(/Lagos HQ/)).toBeInTheDocument();
  });

  it('sends nothing on Cancel', async () => {
    const { onClose, onDeleted } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the warning', () => {
  it('says assigned staff will not be able to clock in', async () => {
    // The consequence that does not appear until Phase 3, on someone else's
    // phone, on a morning nobody connects to this click.
    renderModal();

    expect(screen.getByText(/clock in until they are moved/i)).toBeInTheDocument();
  });

  it('repeats it in the confirmation, since the modal is gone by then', async () => {
    renderModal();

    await confirm();

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/will need a new office/i);
  });
});

describe('when the server refuses', () => {
  it('keeps the modal open and shows the reason', async () => {
    mockDelete.mockRejectedValueOnce(
      new Error('This office still has employees assigned.')
    );
    const { onClose, onDeleted } = renderModal();

    await confirm();

    expect(
      await screen.findByText('This office still has employees assigned.')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('re-enables the button so the action can be retried', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Network error'));
    renderModal();

    await confirm();

    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Delete office' })).toBeEnabled();
  });
});
