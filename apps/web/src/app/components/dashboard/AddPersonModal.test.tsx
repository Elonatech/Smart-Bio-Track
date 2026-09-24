/**
 * @jest-environment jsdom
 */
import { AddPersonModal } from './AddPersonModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserRole } from '@smartbiotrack/types';

/**
 * Inviting someone — the screen where a role is handed out.
 *
 * The role dropdown is the interesting part. It is **not** a security control:
 * the API applies ROLE_CREATION_MATRIX itself and 403s a forbidden role
 * regardless of what the browser sends. The client copy exists so the form
 * offers only what will be accepted, instead of letting an HR Admin pick
 * "Org Super Admin" and discover after submitting that it was never allowed.
 *
 * Worth stating plainly because this form's own schema types `role` as a bare
 * `z.string()`. Nothing client-side stops a crafted request; the dropdown is
 * presentation and the server is the check.
 */

jest.mock('@/lib/api-client', () => ({
  appClient: { get: jest.fn(), post: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : 'Something went wrong',
}));

const success = jest.fn();
const error = jest.fn();
jest.mock('@/app/components/Toast', () => ({
  useToast: () => ({ success, error, info: jest.fn() }),
}));

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;

const INVITED = {
  id: 'u9',
  employeeId: 'EMP-0009',
  name: 'Chinedu Okafor',
  email: 'chinedu@example.com',
  role: 'EMPLOYEE' as UserRole,
  status: 'PENDING',
};

function renderModal(allowedRoles: UserRole[] = ['SUPER_ADMIN', 'HR_ADMIN', 'TEAM_LEAD', 'EMPLOYEE']) {
  const onClose = jest.fn();
  const onInvited = jest.fn();
  render(<AddPersonModal allowedRoles={allowedRoles} onClose={onClose} onInvited={onInvited} />);
  return { onClose, onInvited };
}

/** Fills the three required fields and submits. */
async function inviteSomeone({ name = 'Chinedu Okafor', email = 'chinedu@example.com' } = {}) {
  await userEvent.type(screen.getByLabelText('Full name'), name);
  await userEvent.type(screen.getByLabelText('Work email'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
}

beforeEach(() => {
  mockGet.mockImplementation((url: string) => {
    if (url === '/departments') return Promise.resolve({ data: [{ id: 'dept-1', name: 'Engineering' }] });
    if (url === '/offices') return Promise.resolve({ data: [{ id: 'office-1', name: 'Lagos HQ' }] });
    return Promise.resolve({ data: [] });
  });
  mockPost.mockResolvedValue({ data: INVITED });
});

describe('the role dropdown', () => {
  it('offers exactly the roles the caller is allowed to create', async () => {
    renderModal(['TEAM_LEAD', 'EMPLOYEE']);

    const select = await screen.findByLabelText('Role');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual(['Team Lead', 'Employee']);
  });

  it('does not offer Org Super Admin to an HR Admin', async () => {
    // The matrix says HR_ADMIN may create TEAM_LEAD and EMPLOYEE only.
    // Offering more would mean a 403 after a filled-in form.
    renderModal(['TEAM_LEAD', 'EMPLOYEE']);

    const select = await screen.findByLabelText('Role');
    expect(within(select).queryByRole('option', { name: 'Org Super Admin' })).not.toBeInTheDocument();
  });

  it('defaults to Employee, which is what an admin is nearly always adding', async () => {
    renderModal();

    expect(await screen.findByLabelText('Role')).toHaveValue('EMPLOYEE');
  });

  it('falls back to the first allowed role when Employee is not on offer', async () => {
    // Defensive: no current role has a matrix entry without EMPLOYEE, but an
    // empty select value submits "" and fails validation for no visible reason.
    renderModal(['TEAM_LEAD']);

    expect(await screen.findByLabelText('Role')).toHaveValue('TEAM_LEAD');
  });
});

describe('submitting the form', () => {
  it('posts the fields the API accepts, and only those', async () => {
    renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];

    expect(url).toBe('/users');
    // phoneNumber, jobRole and workRule are collected by the form and have
    // nowhere to go on the server. Sending them risks a 400 from a strict
    // validation pipe, which is the kind of failure that looks like the form
    // being broken rather than the payload being wrong.
    expect(Object.keys(body).sort()).toEqual(
      ['departmentId', 'email', 'name', 'officeId', 'role'].sort()
    );
    expect(body).toMatchObject({
      name: 'Chinedu Okafor',
      email: 'chinedu@example.com',
      role: 'EMPLOYEE',
    });
  });

  it('sends undefined rather than an empty string for an unset department', async () => {
    // "" is a value. A server validating it as a UUID rejects the request,
    // and the admin sees a failure for a field they deliberately left blank.
    renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].departmentId).toBeUndefined();
  });

  it('tells the parent to refetch, so the new person appears in the list', async () => {
    const { onInvited } = renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    await waitFor(() => expect(onInvited).toHaveBeenCalled());
  });
});

describe('after a successful invitation', () => {
  it('shows the employee ID, which the admin has not seen before', async () => {
    // Generated server-side, and it is what the person signs in with. The
    // API emails the activation link itself and stores only a hash of the
    // token, so there is deliberately no link to display here.
    renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    expect(await screen.findByText('Invitation sent')).toBeInTheDocument();
    expect(screen.getByText('EMP-0009')).toBeInTheDocument();
  });

  it('does not offer an activation link to copy', async () => {
    // An earlier version returned the raw token and displayed it. Anything
    // resembling a copyable link here means the token came back over the
    // wire, which is the thing that changed.
    renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    await screen.findByText('Invitation sent');
    expect(screen.queryByText(/\/complete-registration\?token=/)).not.toBeInTheDocument();
  });

  it('replaces the form rather than leaving it fillable', async () => {
    // Submitting twice would invite the same person twice and produce a
    // duplicate-email error on the second attempt.
    renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    await screen.findByText('Invitation sent');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });
});

describe('validation before anything is sent', () => {
  it('posts nothing for an invalid email', async () => {
    // Note what stops it, because it is **not** the zod schema.
    //
    // The field is `type="email"`, so the browser's own constraint validation
    // blocks submission before React sees the event — `handleSubmit` never
    // runs, so the schema never evaluates and its "Enter a valid email
    // address" message never renders. jsdom implements the same step, which
    // is why this test asserts the outcome (nothing sent) rather than a
    // message that cannot appear.
    //
    // That is fine behaviour — the native tooltip is a perfectly good error —
    // but anyone reading the schema would reasonably expect its message to be
    // what shows, and it is not.
    renderModal();
    await screen.findByLabelText('Role');

    await userEvent.type(screen.getByLabelText('Full name'), 'Chinedu Okafor');
    const email = screen.getByLabelText('Work email') as HTMLInputElement;
    await userEvent.type(email, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(email.checkValidity()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses a name that is too short', async () => {
    renderModal();
    await screen.findByLabelText('Role');

    await userEvent.type(screen.getByLabelText('Full name'), 'C');
    await userEvent.type(screen.getByLabelText('Work email'), 'c@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('when the server refuses', () => {
  it('shows the reason and keeps the form filled in', async () => {
    mockPost.mockRejectedValueOnce(new Error('Email already in use'));
    const { onInvited, onClose } = renderModal();
    await screen.findByLabelText('Role');

    await inviteSomeone();

    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    // Retyping a form because the email was taken is the difference between
    // a correctable mistake and an infuriating one.
    expect(screen.getByLabelText('Full name')).toHaveValue('Chinedu Okafor');
    expect(onInvited).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the optional lookups', () => {
  it('still renders the form when departments and offices both fail to load', async () => {
    // Both are optional fields. A failed lookup must not block an invitation
    // — each request swallows its own error and falls back to an empty list.
    mockGet.mockRejectedValue(new Error('down'));

    renderModal();

    expect(await screen.findByLabelText('Role')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });
});
