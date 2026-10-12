/**
 * @jest-environment jsdom
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SampleDataBanner } from './SampleDataBanner';
import { render, screen } from '@testing-library/react';

/**
 * The sample-data marker (#29).
 *
 * Twelve dashboard screens invent their numbers. The risk is not a defect —
 * the code is correct — it is that the screens are indistinguishable from
 * working analytics, and a customer shown one in a demo reads 95.2% attendance
 * as a fact about their own organisation.
 *
 * The second block below is the one that matters over time. Asserting the
 * banner renders is easy; the thing that will actually go wrong is a **new**
 * placeholder screen being added without one, months from now, by somebody who
 * has never read this file. So that test walks the dashboard routes and checks
 * the rule itself rather than any particular page.
 */

describe('SampleDataBanner', () => {
  it('says plainly that the data is not real', () => {
    render(<SampleDataBanner describes="attendance figures" />);

    expect(screen.getByText(/Sample data\./)).toBeInTheDocument();
    expect(
      screen.getByText(/not your organization's records/i)
    ).toBeInTheDocument();
  });

  it('names what is illustrative, rather than saying it generically', () => {
    render(<SampleDataBanner describes="payroll runs" />);

    expect(screen.getByText(/payroll runs/)).toBeInTheDocument();
  });

  it('claims the whole screen when the whole screen is sample', () => {
    // The stronger statement, and the honest one for a page that makes no
    // requests at all.
    render(<SampleDataBanner describes="reports" />);

    expect(
      screen.getByText(/Nothing on this screen is read from your account yet/i)
    ).toBeInTheDocument();
  });

  it('narrows the claim when only part of the page is sample', () => {
    // The super admin overview has a real setup reminder and a real
    // organisation name beside invented counts. Telling someone nothing there
    // is real would be its own inaccuracy.
    render(<SampleDataBanner partial />);

    expect(screen.getByText(/Some figures here are/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Nothing on this screen is read from your account yet/i)
    ).not.toBeInTheDocument();
  });

  it('announces politely rather than interrupting', () => {
    // role="status", not "alert". Nothing is wrong; an assertive live region
    // for a permanent notice is noise for anyone using a screen reader.
    render(<SampleDataBanner describes="attendance figures" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

/**
 * The rule, enforced against the source rather than against a list.
 *
 * A hand-maintained list of "pages that need the banner" is the same kind of
 * second copy that #25 was about: it would be right today and wrong the first
 * time somebody adds a screen. This derives both sides from the files.
 */
/** Components under src/app/components, by absolute path. */
const COMPONENTS_DIR = join(__dirname, '..', '..', 'components');

/**
 * True when a page imports a component that talks to the server.
 *
 * Reads the imported file rather than guessing from its name. Only follows
 * `@/app/components/...` imports one level deep, which is enough for this
 * codebase's shape — pages delegate to a component, and that component does
 * its own fetching. If a page ever delegates two levels down, this reports it
 * as a placeholder, which fails loudly rather than passing silently.
 */
function delegatesToLiveComponent(source: string): boolean {
  const imports = source.matchAll(/from ["']@\/app\/components\/([^"']+)["']/g);

  for (const [, relative] of imports) {
    const file = join(COMPONENTS_DIR, `${relative.replace(/^dashboard\//, 'dashboard/')}.tsx`);
    try {
      if (readFileSync(file, 'utf8').includes('appClient')) return true;
    } catch {
      // Not a file we can read (a barrel, a .ts, a path shape this does not
      // handle). Treated as "not live", so the page is still required to
      // carry the marker — the safe direction.
    }
  }

  return false;
}

describe('every placeholder dashboard screen carries the marker', () => {
  const DASHBOARD = join(__dirname, '..', '..', 'dashboard');

  /** Every page.tsx under src/app/dashboard. */
  function pageFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return pageFiles(full);
      return entry === 'page.tsx' ? [full] : [];
    });
  }

  const pages = pageFiles(DASHBOARD).map((path) => ({
    path,
    source: readFileSync(path, 'utf8'),
  }));

  it('finds the dashboard pages at all', () => {
    // Guards the guard: a moved directory would otherwise make every test
    // below pass over an empty list.
    expect(pages.length).toBeGreaterThan(15);
  });

  it.each(pages.map((p) => [p.path.split('dashboard')[1], p]))(
    '%s',
    (_label, page) => {
      const p = page as { path: string; source: string };

      // "Talks to the server" is the test for whether a screen is real,
      // directly or through a component it delegates to.
      //
      // This used to decide "delegates" by matching component *names*
      // containing "PageContent". That was wrong in both directions, and the
      // pull on 30 Sep proved it: two new leave pages delegating to
      // `MyLeaveRequestsList` were flagged — correctly, as it happens, since
      // that component holds a hardcoded array — but only because the name
      // did not match. A page delegating to a genuinely live component with
      // any other name would have been a false positive.
      //
      // So it now follows the import and reads the component. A rule that
      // happens to be right is not the same as a rule that is right.
      const callsApi = p.source.includes('appClient') || delegatesToLiveComponent(p.source);
      const isRedirectOnly = p.source.includes('router.replace');
      const hasBanner = p.source.includes('SampleDataBanner');

      if (callsApi || isRedirectOnly) return;

      // Reached only by a page that fetches nothing, delegates to nobody and
      // redirects nowhere — which means it is showing invented numbers.
      expect(hasBanner).toBe(true);
    }
  );
});
