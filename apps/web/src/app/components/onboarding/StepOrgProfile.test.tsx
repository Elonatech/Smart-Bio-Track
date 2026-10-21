/**
 * @jest-environment jsdom
 */
import { StepOrgProfile } from "./StepOrgProfile";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Onboarding step 1. Pinned: the time zone sends IANA names (the API
 * refuses "WAT"), name and industry are editable now that PATCH
 * /organization can save them, and the logo is visibly "coming soon"
 * rather than a button that silently does nothing.
 */

const prefill = { organizationName: "Acme Ltd", industry: "Retail" };

it("prefills name and industry from signup, editable", async () => {
  render(<StepOrgProfile defaultValues={prefill} onNext={jest.fn()} />);

  const name = screen.getByLabelText("Organization name");
  expect(name).toHaveValue("Acme Ltd");
  await userEvent.clear(name);
  await userEvent.type(name, "Acme Nigeria");
  expect(name).toHaveValue("Acme Nigeria");
  expect(screen.getByLabelText("Industry")).toHaveValue("Retail");
});

it("defaults the time zone to Africa/Lagos, and offers only IANA names", () => {
  render(<StepOrgProfile defaultValues={prefill} onNext={jest.fn()} />);

  const zone = screen.getByLabelText("Timezone") as HTMLSelectElement;
  expect(zone).toHaveValue("Africa/Lagos");
  for (const option of Array.from(zone.options)) {
    expect(option.value).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
  }
});

it('turns old saved progress holding "WAT" into Africa/Lagos', () => {
  render(<StepOrgProfile defaultValues={{ ...prefill, timezone: "WAT" }} onNext={jest.fn()} />);

  expect(screen.getByLabelText("Timezone")).toHaveValue("Africa/Lagos");
});

it("shows the logo upload as coming soon, and it can't be used", () => {
  render(<StepOrgProfile defaultValues={prefill} onNext={jest.fn()} />);

  expect(screen.getByText("Coming soon")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Upload logo/ })).toBeDisabled();
});

it("hands the values up on Continue", async () => {
  const onNext = jest.fn();
  render(<StepOrgProfile defaultValues={prefill} onNext={onNext} />);

  await userEvent.click(screen.getByRole("button", { name: /Continue/ }));

  await waitFor(() =>
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ organizationName: "Acme Ltd", industry: "Retail", timezone: "Africa/Lagos" })
    )
  );
});
