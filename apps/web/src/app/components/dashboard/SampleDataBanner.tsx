import { FlaskConical } from "lucide-react";

/**
 * A union rather than one shape with two optional fields, so the two cases
 * cannot be mixed up.
 *
 * `describes` is meaningless when only part of a page is sample — the sentence
 * becomes "Some figures here are illustrative" and never mentions it — and a
 * plain optional prop would let a caller pass both and silently have one
 * ignored. This way the compiler rejects that, and a `partial` banner cannot
 * be written without noticing it says something different.
 */
type SampleDataBannerProps =
  | {
      /**
       * What is not real yet, in the reader's terms — "attendance figures",
       * "payroll runs". Named rather than generic because several of these
       * screens mix real and sample content, and a blanket "this page shows
       * sample data" over a page headed with the customer's actual
       * organisation name is its own small confusion.
       */
      describes: string;
      partial?: false;
    }
  | {
      describes?: never;
      /**
       * Only part of the page is sample — the super admin overview, where the
       * setup reminder and the organisation name are real and the counts
       * beside them are not. Says "Some figures here", which is the difference
       * between a screen that is a mock-up and a screen with gaps in it.
       */
      partial: true;
    };

/**
 * Marks a screen whose numbers are invented (#29).
 *
 * ## Why this exists
 *
 * Twelve dashboard screens make **no requests to the server at all**. Their
 * attendance percentages, department breakdowns, payroll runs and flagged
 * punches are module constants — `ATTENDANCE_RATE = [95.2, 94.1, …]` and
 * friends. The code is not defective: the constants are well-formed, the
 * charts render correctly, the types are right. It is honest code doing
 * exactly what it says.
 *
 * The problem is what it looks like to somebody who has not read it. These
 * screens are indistinguishable from working analytics, and dashboards exist
 * to be demonstrated. Shown in a sales call, a customer reads 95.2% attendance
 * as a fact about their own organisation — and the person presenting may not
 * know otherwise. Nobody will say "those numbers are made up" unless the
 * screen says it.
 *
 * ## Why a label rather than removing the screens
 *
 * They are the design, and they are useful for exactly the demo purpose that
 * makes them risky. The problem is the absence of a label, not the presence of
 * the screens. Wiring them to real data is Phase 3 work and depends on
 * attendance records existing at all.
 *
 * ## Removing it
 *
 * Delete the element from a page the day that page reads live data. It is
 * deliberately a one-line import and a one-line tag so that deleting it is
 * easier than leaving it — a marker that is awkward to remove is a marker that
 * outlives its truth and starts lying in the other direction.
 */
export function SampleDataBanner({ describes, partial }: SampleDataBannerProps) {
  return (
    <div
      // `status`, not `alert`. A screen reader should mention this when it
      // reaches it, not interrupt to announce it — nothing is wrong, and an
      // assertive live region for a permanent notice is noise.
      role="status"
      // `text-heading` on the paragraph rather than a foreground token on the
      // wrapper: this project defines `--color-warning` and no paired
      // foreground, so `text-warning-foreground` would compile to nothing and
      // leave the text at whatever it inherited.
      className="flex items-start gap-2 bg-warning/10 border border-warning/30 text-sm rounded-md px-4 py-2.5 mb-4"
    >
      <FlaskConical className="h-4 w-4 shrink-0 mt-0.5 text-warning" strokeWidth={1.75} />
      <p className="text-heading">
        <span className="font-semibold">Sample data.</span>{" "}
        {partial ? "Some figures here are" : `The ${describes} below are`}{" "}
        illustrative examples, not your organization&apos;s records.
        {!partial && " Nothing on this screen is read from your account yet."}
      </p>
    </div>
  );
}
