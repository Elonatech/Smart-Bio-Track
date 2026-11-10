/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import { useStoredValue } from "./useStoredValue";

/**
 * Pins the three promises useStoredValue makes: it reads what's already
 * stored, a write reaches every component reading that key, and blocked
 * storage still works for the page view instead of silently doing nothing.
 */

function Reader({ label }: { label: string }) {
  const [value, setValue] = useStoredValue("local", "flag");
  return (
    <button type="button" onClick={() => setValue("on")}>
      {label}:{value ?? "none"}
    </button>
  );
}

beforeEach(() => localStorage.clear());

it("reads a value that's already stored", () => {
  localStorage.setItem("flag", "on");
  render(<Reader label="a" />);

  expect(screen.getByText("a:on")).toBeInTheDocument();
});

it("a write updates every reader of that key, and is stored", () => {
  render(
    <>
      <Reader label="a" />
      <Reader label="b" />
    </>
  );

  act(() => screen.getByText("a:none").click());

  expect(screen.getByText("a:on")).toBeInTheDocument();
  expect(screen.getByText("b:on")).toBeInTheDocument();
  expect(localStorage.getItem("flag")).toBe("on");
});

it("still works for this page view when storage refuses the write", () => {
  const setItem = jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
  render(<Reader label="a" />);

  act(() => screen.getByText("a:none").click());

  expect(screen.getByText("a:on")).toBeInTheDocument();
  setItem.mockRestore();
});
