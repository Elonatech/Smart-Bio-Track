/**
 * @jest-environment jsdom
 */
import DepartmentsPage from "./page";
import { appClient } from "@/lib/api-client";
import { renderWithProviders, signInAs, screen, waitFor, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

/**
 * The Departments page reads /departments and every page of /users through
 * the shared cache. Worth pinning: departments come out sorted by name with
 * real headcounts, unassigned staff are called out, a failed load says so,
 * and the table is read again after a delete.
 */

jest.mock("@/lib/api-client", () => ({
  appClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong",
}));

const mockGet = appClient.get as jest.Mock;
const mockDelete = appClient.delete as jest.Mock;

const DEPARTMENTS = [
  { id: "d-ops", name: "Operations" },
  { id: "d-fin", name: "Finance" },
];

function usersPage(page: number, totalPages: number, items: { id: string; departmentId: string | null }[]) {
  return { data: { items, page, limit: 100, total: items.length, totalPages } };
}

function serve(departments = DEPARTMENTS) {
  mockGet.mockImplementation((url: string, config?: { params?: { page?: number } }) => {
    if (url === "/departments") return Promise.resolve({ data: departments });
    // Two pages of users, to prove every page is counted.
    if (config?.params?.page === 2) {
      return Promise.resolve(usersPage(2, 2, [{ id: "u3", departmentId: "d-ops" }]));
    }
    return Promise.resolve(
      usersPage(1, 2, [
        { id: "u1", departmentId: "d-ops" },
        { id: "u2", departmentId: null },
      ])
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("SUPER_ADMIN");
  serve();
  mockDelete.mockResolvedValue({ data: {} });
});

it("lists departments by name, counting staff across every page of users", async () => {
  renderWithProviders(<DepartmentsPage />);

  const names = (await screen.findAllByText(/^(Finance|Operations)$/)).map((el) => el.textContent);
  expect(names[0]).toBe("Finance");
  expect(screen.getAllByText("2 employees").length).toBeGreaterThan(0);
  expect(screen.getByText(/1\s+employee has no\s+department/)).toBeInTheDocument();
});

it("says so when the list can't load", async () => {
  mockGet.mockRejectedValue(new Error("Network Error"));
  renderWithProviders(<DepartmentsPage />);

  expect(await screen.findByText("Couldn't load departments. Please try again.")).toBeInTheDocument();
});

it("reads the table again after a delete", async () => {
  renderWithProviders(<DepartmentsPage />);
  await screen.findAllByText("Finance");
  serve([{ id: "d-ops", name: "Operations" }]);

  await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog)
    .getAllByRole("button")
    .find((b) => /delete/i.test(b.textContent ?? "")) as HTMLElement;
  await userEvent.click(confirm);

  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/departments/d-fin"));
  await waitFor(() => expect(screen.queryAllByText("Finance")).toHaveLength(0));
});
