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

      // "Talks to the server" is the test for whether a screen is real. A page
      // that delegates to a component doing the fetching counts as real — the
      // import is the evidence, and those pages are a handful of lines long.
      const callsApi = p.source.includes('appClient');
      const delegates =
        /import \{[^}]*(PageContent|EmployeesPageContent|ProfilePageContent)[^}]*\}/s.test(
          p.source
        );
      const isRedirectOnly = p.source.includes('router.replace');
      const hasBanner = p.source.includes('SampleDataBanner');

      if (callsApi || delegates || isRedirectOnly) return;

      // Reached only by a page that fetches nothing, delegates to nobody and
      // redirects nowhere — which means it is showing invented numbers.
      expect(hasBanner).toBe(true);
    }
  );
});
