import { useEffect, type RefObject } from "react";

// Extracted from PunchReviewModal, which had this written out in full while
// every other modal in the app (DepartmentFormModal, OfficeFormModal,
// AddPersonModal, the Delete* confirmations, etc.) had none of it — just a
// bare `<div role="dialog">` with no Escape handling and no focus trap, so a
// keyboard user could Tab straight through into the page behind the overlay.
//
// Attach `panelRef` to the dialog panel (not the backdrop), give the panel
// `tabIndex={-1}` so it's a valid focus target, and pass the same `onClose`
// the backdrop's onClick and the header's X button already use.
export function useModalA11y(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    // Remember where focus was so it can go back there when the modal
    // closes — otherwise a keyboard user is dumped at the top of the
    // document.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    // The page behind shouldn't scroll while the modal is open.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      // Focus trap: collect what's actually focusable right now (disabled
      // controls are excluded automatically) and wrap Tab around the ends
      // so focus can't escape to the page behind.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [panelRef, onClose]);
}
