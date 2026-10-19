/**
 * @jest-environment jsdom
 */
import OnboardingPage from './page';
import { appClient } from '@/lib/api-client';
import { setOnboardingIndustryHint } from '@/lib/onboarding-hint';
import { renderWithProviders, signInAs, signOut, screen, waitFor } from '@/test/render';
import userEvent from '@testing-library/user-event';

/**
 * The onboarding wizard's own behaviour — not the forms inside each step.
 *
 * Each step is replaced with a stub that shows the values it was handed and
 * has one "Next" button. That keeps these tests about what the wizard owns:
 * per-user saved progress, the signup prefill, the skip exits, and the final
 * save across several real endpoints (offices, departments, users). The step
 * forms have their own validation and are tested — or not — on their own.
 *
 * Why this page matters enough to test: it's where a production session
 * problem first showed (users bounced to login mid-setup, progress lost), and
 * its finish handler must be safe to retry after a partial failure.
 */

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

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

// What each stub step submits when its Next button is clicked.
const STEP_VALUES = {
  orgProfile: { organizationName: 'Acme Ltd', industry: 'Retail', timezone: 'WAT' },
  office: {
    officeName: 'Lagos HQ',
    latitude: 6.5,
    longitude: 3.4,
    geofenceRadiusMeters: 100,
  },
  workRules: {
    startTime: '08:00',
    endTime: '17:00',
    gracePeriodMinutes: 15,
    overtimeAfterHours: 17,
    overtimeMultiplier: 1.5,
  },
  departments: { departments: [{ name: 'Engineering' }, { name: 'Sales' }] },
  inviteTeam: {
    invites: [{ name: 'Bola Ade', email: 'bola@acme.test', role: 'EMPLOYEE', department: 'Engineering' }],
  },
};

function makeStub(label: string, key: keyof typeof STEP_VALUES) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function Stub({ defaultValues, onNext }: any) {
    return (
      <div>
        <h2>{label}</h2>
        <pre data-testid="defaults">{JSON.stringify(defaultValues ?? null)}</pre>
        <button type="button" onClick={() => onNext(STEP_VALUES[key])}>
          Next
        </button>
      </div>
    );
  };
}

jest.mock('@/app/components/onboarding/StepOrgProfile', () => ({
  StepOrgProfile: makeStub('Org profile step', 'orgProfile'),
}));
jest.mock('@/app/components/onboarding/StepOffice', () => ({
  StepOffice: makeStub('Branch step', 'office'),
}));
jest.mock('@/app/components/onboarding/StepWorkRules', () => ({
  __esModule: true,
  default: makeStub('Work rules step', 'workRules'),
}));
jest.mock('@/app/components/onboarding/StepDepartments', () => ({
  __esModule: true,
  default: makeStub('Departments step', 'departments'),
}));
jest.mock('@/app/components/onboarding/StepInviteTeam', () => ({
  __esModule: true,
  default: makeStub('Invite step', 'inviteTeam'),
}));

const mockGet = appClient.get as jest.Mock;
const mockPost = appClient.post as jest.Mock;

const PROGRESS_KEY = 'onboarding-progress:user-1';

/** Starts the wizard already on the confirmation step with every value filled. */
function seedFinishedWizard() {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ currentStep: 6, payload: STEP_VALUES })
  );
}

/** GET responses for the finish handler's "what already exists" reads. */
function existing({
  offices = [] as { name: string }[],
  departments = [] as { id?: string; name: string }[],
  users = [] as { email: string }[],
  workRules = [] as { name: string }[],
} = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/offices') return Promise.resolve({ data: offices });
    if (url === '/departments') {
      return Promise.resolve({
        data: departments.map((d, i) => ({ id: d.id ?? `dept-${i}`, name: d.name })),
      });
    }
    if (url === '/users') return Promise.resolve({ data: { items: users } });
    if (url === '/work-rules') return Promise.resolve({ data: workRules });
    return Promise.reject(new Error('unexpected GET ' + url));
  });
}

const postsTo = (url: string) => mockPost.mock.calls.filter(([u]) => u === url);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  signOut();
  signInAs('SUPER_ADMIN');
  mockPost.mockResolvedValue({ data: {} });
  existing();
});

describe('saved progress', () => {
  it('starts at step 1 when there is nothing saved', async () => {
    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByText('Org profile step')).toBeInTheDocument();
  });

  it('saves the step and values after each Next, under this user only', async () => {
    renderWithProviders(<OnboardingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByText('Branch step');

    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    expect(saved.currentStep).toBe(2);
    expect(saved.payload.orgProfile).toEqual(STEP_VALUES.orgProfile);
  });

  it('resumes at the saved step with the saved values', async () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ currentStep: 3, payload: { orgProfile: STEP_VALUES.orgProfile } })
    );

    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByText('Work rules step')).toBeInTheDocument();
  });

  it("does not resume another user's half-finished setup", async () => {
    // A shared office computer: someone else's progress sits under their id.
    localStorage.setItem(
      'onboarding-progress:someone-else',
      JSON.stringify({ currentStep: 4, payload: {} })
    );

    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByText('Org profile step')).toBeInTheDocument();
  });

  it('clamps a saved step from an older build instead of showing a blank screen', async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ currentStep: 99, payload: {} }));

    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByText('Your workspace is ready')).toBeInTheDocument();
  });

  it('starts fresh rather than crashing on corrupt saved progress', async () => {
    localStorage.setItem(PROGRESS_KEY, '{not json');

    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByText('Org profile step')).toBeInTheDocument();
  });
});

describe('prefill from signup', () => {
  it('hands step 1 the org name from sign-in and the industry from verification', async () => {
    setOnboardingIndustryHint('Healthcare');

    renderWithProviders(<OnboardingPage />);
    await screen.findByText('Org profile step');

    const defaults = JSON.parse(screen.getByTestId('defaults').textContent ?? 'null');
    expect(defaults).toMatchObject({ organizationName: 'Acme Ltd', industry: 'Healthcare' });
  });

  it('keeps what the person typed when resuming, rather than re-applying the signup values', async () => {
    setOnboardingIndustryHint('Healthcare');
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        currentStep: 1,
        payload: { orgProfile: { organizationName: 'Acme Nigeria', industry: 'Retail', timezone: 'WAT' } },
      })
    );

    renderWithProviders(<OnboardingPage />);
    await screen.findByText('Org profile step');

    const defaults = JSON.parse(screen.getByTestId('defaults').textContent ?? 'null');
    expect(defaults).toMatchObject({ organizationName: 'Acme Nigeria', industry: 'Retail' });
  });
});

describe('the exits', () => {
  it('Skip this step moves on without recording anything for that step', async () => {
    renderWithProviders(<OnboardingPage />);
    await screen.findByText('Org profile step');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Branch step');
    await userEvent.click(screen.getByRole('button', { name: 'Skip this step' }));

    expect(await screen.findByText('Work rules step')).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    expect(saved.payload.office).toBeUndefined();
  });

  it('Skip setup goes to the dashboard, not the welcome screen', async () => {
    // "Your workspace is live" would be untrue for an org that skipped setup.
    renderWithProviders(<OnboardingPage />);
    await screen.findByText('Org profile step');

    await userEvent.click(screen.getByRole('button', { name: /Skip setup/ }));

    expect(push).toHaveBeenCalledWith('/dashboard/super-admin');
  });
});

describe('finishing setup', () => {
  it('creates the branch, each department and each invite through the real endpoints', async () => {
    seedFinishedWizard();
    renderWithProviders(<OnboardingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(postsTo('/offices')).toEqual([
      ['/offices', { name: 'Lagos HQ', latitude: 6.5, longitude: 3.4, geofenceRadiusMeters: 100 }],
    ]);
    expect(postsTo('/departments').map(([, body]) => body)).toEqual([
      { name: 'Engineering' },
      { name: 'Sales' },
    ]);
    expect(postsTo('/users')).toHaveLength(1);
  });

  it("saves the work rules step as the organization's default rule", async () => {
    seedFinishedWizard();
    renderWithProviders(<OnboardingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(postsTo('/work-rules')).toEqual([
      [
        '/work-rules',
        {
          name: 'Standard hours',
          workingDays: [1, 2, 3, 4, 5],
          startTime: '08:00',
          endTime: '17:00',
          gracePeriodMinutes: 15,
          // Overtime "from 17:00" on an 08:00 start = after 9 hours worked.
          overtimeAfterMinutes: 540,
          overtimeMultiplier: 1.5,
          isDefault: true,
        },
      ],
    ]);
  });

  it('does not add a second default when the organization already has a work rule', async () => {
    // A retry after a partial failure, or hours already set up elsewhere.
    seedFinishedWizard();
    existing({ workRules: [{ name: 'Night shift' }] });
    renderWithProviders(<OnboardingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(postsTo('/work-rules')).toHaveLength(0);
  });

  it("attaches an invite to its department by the department's real id", async () => {
    seedFinishedWizard();
    // After the department POSTs, the re-read returns real ids.
    let departmentsCreated = false;
    mockPost.mockImplementation((url: string) => {
      if (url === '/departments') departmentsCreated = true;
      return Promise.resolve({ data: {} });
    });
    mockGet.mockImplementation((url: string) => {
      if (url === '/departments') {
        return Promise.resolve({
          data: departmentsCreated
            ? [{ id: 'dept-eng', name: 'Engineering' }, { id: 'dept-sales', name: 'Sales' }]
            : [],
        });
      }
      if (url === '/users') return Promise.resolve({ data: { items: [] } });
      return Promise.resolve({ data: [] });
    });

    renderWithProviders(<OnboardingPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(postsTo('/users')[0][1]).toMatchObject({
      email: 'bola@acme.test',
      departmentId: 'dept-eng',
    });
  });

  it('is safe to retry: skips anything that already exists, matching names case-insensitively', async () => {
    // The state a partial failure leaves behind: some records got created.
    seedFinishedWizard();
    existing({
      offices: [{ name: 'lagos hq' }],
      departments: [{ name: 'ENGINEERING' }],
      users: [{ email: 'Bola@Acme.test' }],
    });

    renderWithProviders(<OnboardingPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(postsTo('/offices')).toHaveLength(0);
    expect(postsTo('/departments').map(([, body]) => body)).toEqual([{ name: 'Sales' }]);
    expect(postsTo('/users')).toHaveLength(0);
  });

  it('lands on the welcome page with the org name, and clears the saved progress', async () => {
    seedFinishedWizard();
    renderWithProviders(<OnboardingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/onboarding/welcome?org=Acme%20Ltd')
    );
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it('stays on the confirmation step and shows why when a save fails', async () => {
    seedFinishedWizard();
    mockPost.mockRejectedValueOnce(new Error('A branch with this name already exists'));

    renderWithProviders(<OnboardingPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));

    expect(
      await screen.findByText('A branch with this name already exists')
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // Progress survives so the retry has something to retry with.
    expect(localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
    // And there's still a way back or out.
    expect(screen.getByRole('button', { name: /Back/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Skip setup/ })).toBeEnabled();
  });
});
