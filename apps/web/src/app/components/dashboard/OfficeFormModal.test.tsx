/**
 * @jest-environment jsdom
 */
import { OfficeFormModal } from './OfficeFormModal';
import { appClient } from '@/lib/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Creating and editing an office (#27).
 *
 * An office is not a label — it is a **geo-fence**: a coordinate and a radius
 * that attendance will be measured against in Phase 3. Getting it wrong has
 * two shapes, and neither announces itself:
 *
 *  - a radius too small, and staff standing in the building cannot clock in;
 *  - a radius too large, or coordinates in the wrong hemisphere, and they can
 *    clock in from home.
 *
 * The bounds on latitude and longitude are not arbitrary tightening. They are
 * the only values those fields can ever hold, and the comment in the component
 * records why they were added: the map picker pans to whatever is typed, so
 * "324" used to validate and render a blank, nowhere view.
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

// Leaflet touches `window` at module-evaluation time and needs a real layout
// engine, which jsdom does not provide. The picker is loaded through
// next/dynamic with ssr:false for the same reason. What it reports back is the
// form's own coordinate state, which is covered directly below.
jest.mock('@/app/components/dashboard/GeofenceMapPicker', () => ({
  GeofenceMapPicker: () => <div data-testid="map-picker" />,
}));

const mockPost = appClient.post as jest.Mock;
const mockPut = appClient.put as jest.Mock;

const EXISTING = {
  id: 'office-1',
  name: 'Lagos HQ',
  latitude: 6.5244,
  longitude: 3.3792,
  geofenceRadiusMeters: 150,
};

function renderModal(office?: typeof EXISTING) {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  render(<OfficeFormModal office={office} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save office' }));

async function setField(label: RegExp, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: {} });
});

describe('creating an office', () => {
  it('POSTs the name, coordinates and radius', async () => {
    const { onSaved, onClose } = renderModal();

    await setField(/office name/i, 'Abuja Branch');
    await save();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];

    expect(url).toBe('/offices');
    expect(body).toMatchObject({ name: 'Abuja Branch' });
    // The geo-fence, not just the label.
    expect(typeof body.latitude).toBe('number');
    expect(typeof body.longitude).toBe('number');
    expect(typeof body.geofenceRadiusMeters).toBe('number');

    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends numbers, not the strings the inputs hold', async () => {
    // `valueAsNumber` on the registration is what does this. Without it the
    // API receives "6.5244" and a strict pipe rejects the whole request — or
    // worse, accepts it and stores a string where a distance calculation
    // expects a number.
    renderModal();

    await setField(/office name/i, 'Abuja Branch');
    await setField(/latitude/i, '9.0579');
    await save();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][1].latitude).toBe(9.0579);
  });

  it('defaults to a real place rather than null island', async () => {
    // 0,0 is in the Gulf of Guinea. Defaulting there means a new office is
    // valid, plausible-looking and thousands of kilometres from anywhere.
    renderModal();

    expect(screen.getByLabelText(/latitude/i)).toHaveValue(6.5244);
    expect(screen.getByLabelText(/longitude/i)).toHaveValue(3.3792);
  });
});

describe('editing an office', () => {
  it('PUTs to the office being edited, not POSTing a duplicate', async () => {
    const { onSaved } = renderModal(EXISTING);

    await setField(/office name/i, 'Lagos Head Office');
    await save();

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][0]).toBe('/offices/office-1');
    expect(mockPost).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('pre-fills the existing geo-fence rather than the defaults', async () => {
    // Opening an edit form that silently shows default coordinates is how a
    // manager changing only the name moves the office to Lagos.
    renderModal({ ...EXISTING, latitude: 9.0579, longitude: 7.4951, geofenceRadiusMeters: 500 });

    expect(screen.getByLabelText(/office name/i)).toHaveValue('Lagos HQ');
    expect(screen.getByLabelText(/latitude/i)).toHaveValue(9.0579);
    expect(screen.getByLabelText(/longitude/i)).toHaveValue(7.4951);
  });
});

describe('the coordinate bounds', () => {
  // Real values, not arbitrary limits. Outside them the map renders nowhere
  // and the geo-fence means nothing.
  it.each([
    ['latitude', /latitude/i, '324'],
    ['latitude', /latitude/i, '-91'],
    ['longitude', /longitude/i, '181'],
    ['longitude', /longitude/i, '-181'],
  ])('refuses an out-of-range %s (%s)', async (_field, label, value) => {
    renderModal();

    await setField(/office name/i, 'Somewhere');
    await setField(label, value);
    await save();

    await waitFor(() => expect(mockPost).not.toHaveBeenCalled());
  });

  it('accepts the extremes, which are valid places', async () => {
    // -90 and 180 are real coordinates. A bound written as `> -90` instead of
    // `>= -90` would reject the South Pole, which is silly but is the kind of
    // off-by-one that only a test finds.
    renderModal();

    await setField(/office name/i, 'Edge Case');
    await setField(/latitude/i, '-90');
    await setField(/longitude/i, '180');
    await save();

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });
});

describe('the radius', () => {
  // The radius is a **range slider**, so the schema's min(1)/max(100000) is a
  // second line of defence that a person using the form cannot reach — the
  // browser clamps to the input's own bounds first. A first draft of these
  // tests typed "0" and "250000" and asserted nothing was sent; they passed,
  // but they were asserting a path the UI cannot produce, which is a test that
  // cannot fail for the reason it claims.
  //
  // What actually constrains it is the element, so that is what is asserted.
  it('cannot be dragged below the schema floor', () => {
    // Not a hardcoded 10. The slider's own minimum is a product choice and may
    // move; what must hold is that it cannot produce a value the validator
    // then rejects — a slider that out-ranges its own schema gives a form
    // that fails on submit with nothing on screen explaining why.
    renderModal();

    const min = Number(screen.getByLabelText(/radius/i).getAttribute('min'));

    expect(min).toBeGreaterThanOrEqual(1);
  });

  it('is capped, so the fence stays a fence', () => {
    renderModal();

    const slider = screen.getByLabelText(/radius/i);
    const max = Number(slider.getAttribute('max'));

    expect(max).toBeGreaterThan(0);
    // Whatever the cap is, it must not exceed what the schema will accept —
    // a slider that can out-range its own validator produces a form that
    // fails on submit with no visible reason.
    expect(max).toBeLessThanOrEqual(100000);
  });

  it('shows the current value in the label, since a slider has no readout', () => {
    renderModal({ ...EXISTING, geofenceRadiusMeters: 250 });

    expect(screen.getByText(/250 m/)).toBeInTheDocument();
  });
});

describe('validation and failure', () => {
  it('refuses a name shorter than three characters', async () => {
    renderModal();

    await setField(/office name/i, 'HQ');
    await save();

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows why when the server refuses', async () => {
    mockPost.mockRejectedValueOnce(new Error('An office with this name already exists'));
    const { onSaved, onClose } = renderModal();

    await setField(/office name/i, 'Lagos HQ');
    await save();

    expect(
      await screen.findByText('An office with this name already exists')
    ).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', async () => {
    const { onClose, onSaved } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
