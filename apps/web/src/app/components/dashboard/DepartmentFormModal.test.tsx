/**
 * @jest-environment jsdom
 */
import { DepartmentFormModal } from './DepartmentFormModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Creating and editing a department (#27).
 *
 * Small, and it carries one thing worth holding: **the name is trimmed before
 * it is sent.** Department names are unique per organisation, so `"  HR  "`
 * and `"HR"` look like two different names in the form while the constraint
 * treats them as one — the admin types what looks like a new department and
 * gets a duplicate-name error about a name they cannot see.
 *
 * The other half is that a department is what a TEAM_LEAD's data scope keys
 * off (`visibleUsersWhere`), so creating and renaming them is not cosmetic
 * even though the form is two fields.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { post: jest.fn(), put: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockPost = appClient.post as jest.Mock;
const mockPut = appClient.put as jest.Mock;

const DEPARTMENT = { id: 'dept-1', name: 'Engineering' };

function renderModal(department?: typeof DEPARTMENT) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(
    <DepartmentFormModal department={department} onClose={onClose} onSaved={onSaved} />
  );
  return { onClose, onSaved };
}

async function typeName(value: string) {
  const input = screen.getByLabelText(/department name/i);
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: {} });
});

describe('creating', () => {
  it('POSTs the new department', async () => {
    const { onSaved, onClose } = renderModal();

    await typeName('Field Operations');
    await userEvent.click(screen.getByRole('button', { name: 'Create department' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/departments', { name: 'Field Operations' })
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('trims the name before sending it', async () => {
    // The duplicate-name trap. Unique per organisation, so "  HR  " and "HR"
    // collide server-side while looking distinct in the form — the admin
    // sees an error about a name they did not type.
    renderModal();

    await typeName('   Field Operations   ');
    await userEvent.click(screen.getByRole('button', { name: 'Create department' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].name).toBe('Field Operations');
  });

  it('offers a create label, not a save one', () => {
    // The two modes share a component; the label is the only thing telling
    // the admin which one they are in.
    renderModal();

    expect(screen.getByRole('button', { name: 'Create department' })).toBeInTheDocument();
  });
});

describe('editing', () => {
  it('PUTs to the department being edited rather than creating a second one', async () => {
    const { onSaved } = renderModal(DEPARTMENT);

    await typeName('Engineering & Platform');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/departments/dept-1', {
        name: 'Engineering & Platform',
      })
    );
    expect(mockPost).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('pre-fills the current name', () => {
    renderModal(DEPARTMENT);

    expect(screen.getByLabelText(/department name/i)).toHaveValue('Engineering');
  });

  it('reassures that a rename does not unassign anybody', async () => {
    // A reasonable fear when renaming something people are attached to, and
    // cheap to answer at the moment it is felt.
    renderModal(DEPARTMENT);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1]).toMatch(/keeps their assignment/i);
  });
});

describe('validation and failure', () => {
  it('refuses a name below the minimum length', async () => {
    renderModal();

    await typeName('H');
    await userEvent.click(screen.getByRole('button', { name: 'Create department' }));

    expect(await screen.findByText('Department name is required')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses a name that is only whitespace', async () => {
    // Trimming happens in the schema, so spaces collapse to an empty string
    // and fail the minimum — rather than creating a department with a blank
    // name that nobody can identify in a dropdown.
    renderModal();

    await typeName('    ');
    await userEvent.click(screen.getByRole('button', { name: 'Create department' }));

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });

  it('keeps the modal open and shows why when the server refuses', async () => {
    mockPost.mockRejectedValueOnce(
      new Error('A department with this name already exists')
    );
    const { onSaved, onClose } = renderModal();

    await typeName('Engineering');
    await userEvent.click(screen.getByRole('button', { name: 'Create department' }));

    expect(
      await screen.findByText('A department with this name already exists')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', async () => {
    const { onClose, onSaved } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
