/**
 * @jest-environment jsdom
 */
import { EditEmployeeModal, type EditableEmployee } from './EditEmployeeModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRole } from '@smartbiotrack/types';

/**
 * Editing someone, which includes changing their role.
 *
 * **Saving went live on 25 Sep 2026** with `PATCH /users/:id` (#30). Before
 * that this form was complete and disabled behind a flag, and the tests here
 * pinned the disabled state deliberately so that flipping the flag would fail
 * them. It did, which is what brought someone back to write the real ones.
 *
 * The role dropdown is the caller's creatable roles **plus whatever this
 * person already is**, because a select whose value is absent from its options
 * silently displays the first one instead — the admin opens the form to change
 * a department and the role field is quietly sitting on something else, one
 * save away from a real demotion.
 *
 * **Correction, 25 Sep 2026.** This block previously justified the union with
 * "an HR Admin editing another HR Admin". That scenario cannot happen: the
 * server's ROLE_AUTHORITY_MATRIX gates which users may be edited by their
 * present role, and it holds the same contents as the browser's
 * ROLE_CREATION_MATRIX — so anyone you may edit already holds a role you may
 * assign, and the union adds nothing today.
 *
 * The tests below are kept, and so is the union, because the guarantee comes
 * from two separately maintained tables happening to agree. If either is ever
 * widened alone, this is what stops the dropdown misrepresenting a role.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn(), patch: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockGet = appClient.get as jest.Mock;
const mockPatch = appClient.patch as jest.Mock;

function employee(overrides: Partial<EditableEmployee> = {}): EditableEmployee {
  return {
    id: 'u42',
    employeeId: 'EMP-0042',
    name: 'Bola Eze',
    email: 'bola@example.com',
    role: 'EMPLOYEE',
    departmentId: 'dept-1',
    officeId: 'office-1',
    ...overrides,
  };
}

function renderModal({
  allowedRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] as UserRole[],
  ...overrides
}: Partial<EditableEmployee> & { allowedRoles?: UserRole[] } = {}) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(
    <EditEmployeeModal
      employee={employee(overrides)}
      allowedRoles={allowedRoles}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
  return { onClose, onSaved };
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/departments') return Promise.resolve({ data: [{ id: 'dept-1', name: 'Engineering' }] });
    if (url === '/offices') return Promise.resolve({ data: [{ id: 'office-1', name: 'Lagos HQ' }] });
    return Promise.resolve({ data: [] });
  });
  mockPatch.mockResolvedValue({ data: {} });
});

describe('the role dropdown', () => {
  it('always includes the role the person already holds', async () => {
    // Driven with an allowedRoles list that omits the current role. That
    // combination is not reachable through the real matrices today (see the
    // note at the top of this file) — it is the contract the component
    // promises, tested directly rather than through a scenario.
    renderModal({ role: 'HR_ADMIN', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = (await screen.findByLabelText('Role')) as HTMLSelectElement;

    expect(within(select).getByRole('option', { name: 'HR Administrator' })).toBeInTheDocument();
    // The value matching is the actual protection. A select whose value is
    // absent from its options shows the first option instead, so opening the
    // form to change a department would silently stage a demotion.
    expect(select.value).toBe('HR_ADMIN');
  });

  it('does not duplicate the current role when it is already allowed', async () => {
    renderModal({ role: 'EMPLOYEE', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    const employeeOptions = within(select)
      .getAllByRole('option')
      .filter((o) => o.textContent === 'Employee');

    expect(employeeOptions).toHaveLength(1);
  });

  it('still offers the roles the caller may assign', async () => {
    renderModal({ role: 'HR_ADMIN', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual(['HR Administrator', 'Team Lead', 'Employee']);
  });

  it('does not offer a promotion the caller could not make', async () => {
    // The server applies the matrix regardless; this keeps the form from
    // offering something that returns 403 after a save.
    renderModal({ role: 'EMPLOYEE', allowedRoles: ['TEAM_LEAD', 'EMPLOYEE'] });

    const select = await screen.findByLabelText('Role');
    expect(within(select).queryByRole('option', { name: 'Org Super Admin' })).not.toBeInTheDocument();
  });
});

describe('saving', () => {
  /**
   * Live since 25 Sep 2026. `PATCH /users/:id` now exists (#30) and
   * `EDIT_ENDPOINT_READY` is true.
   *
   * The block that used to sit here pinned the *disabled* state and was
   * written to fail the moment the flag flipped. It did exactly that, which
   * is what brought someone back to this file to write these.
   */

  it('PATCHes the person, sending only what the API accepts', async () => {
    const { onSaved, onClose } = renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const [url, body] = mockPatch.mock.calls[0];

    expect(url).toBe('/users/u42');
    // Email and employeeId are deliberately absent from the DTO — both are
    // login identifiers, and changing either is a feature rather than a field.
    expect(Object.keys(body).sort()).toEqual(
      ['departmentId', 'name', 'officeId', 'role'].sort()
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('carries an edited name through', async () => {
    renderModal();
    await screen.findByLabelText('Role');

    const name = screen.getByLabelText('Full name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bolanle Eze');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch.mock.calls[0][1].name).toBe('Bolanle Eze');
  });

  it('sends a changed role', async () => {
    renderModal({ role: 'EMPLOYEE' });
    await screen.findByLabelText('Role');

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'TEAM_LEAD');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    expect(mockPatch.mock.calls[0][1].role).toBe('TEAM_LEAD');
  });

  it('sends undefined rather than "" when a select is left unset', async () => {
    // "" is what an empty <select> gives. The API expects the field absent or
    // explicitly null; an empty string fails the UUID check and reads to the
    // admin as a broken form.
    renderModal({ departmentId: null, officeId: null });
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalled());
    const body = mockPatch.mock.calls[0][1];
    expect(body.departmentId).toBeUndefined();
    expect(body.officeId).toBeUndefined();
  });

  it('keeps the modal open and shows why when the save fails', async () => {
    mockPatch.mockRejectedValueOnce(new Error('You cannot edit your own account.'));
    const { onSaved, onClose } = renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('You cannot edit your own account.')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces the role ceiling refusal as the server words it', async () => {
    // An HR_ADMIN who somehow submits SUPER_ADMIN gets a 403 with a readable
    // reason. The dropdown should not have offered it, so this is the second
    // line rather than the first — but a silent failure here would look like
    // the save button being broken.
    mockPatch.mockRejectedValueOnce(
      new Error('A HR_ADMIN may not assign the role SUPER_ADMIN')
    );
    renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('A HR_ADMIN may not assign the role SUPER_ADMIN')
    ).toBeInTheDocument();
  });

  it('re-enables the button after a failure', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Network error'));
    renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Network error');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('no longer warns that saving is unavailable', async () => {
    // The note that accompanied the disabled button. Leaving it visible beside
    // a working save would be its own small lie.
    renderModal();
    await screen.findByLabelText('Role');

    expect(screen.queryByText(/Saving is disabled/i)).not.toBeInTheDocument();
  });
});

describe('what it shows', () => {
  it('identifies who is being edited', async () => {
    renderModal();

    expect(await screen.findByText(/bola@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMP-0042/)).toBeInTheDocument();
  });

  it('pre-fills the current name rather than starting blank', async () => {
    renderModal();

    expect(await screen.findByLabelText('Full name')).toHaveValue('Bola Eze');
  });

  it('closes without saving on Cancel', async () => {
    const { onClose, onSaved } = renderModal();
    await screen.findByLabelText('Role');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
