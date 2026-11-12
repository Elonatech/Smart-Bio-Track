/**
 * @jest-environment jsdom
 */
import { useNotifications } from "./notifications";
import { renderWithProviders, signInAs, signOut, screen, act } from "@/test/render";

/**
 * useNotifications now reads through the shared cache and keeps read-state
 * with useStoredValue. Worth pinning: the list arrives newest first, read
 * marks are remembered per user in localStorage, and nobody signed in sees
 * nothing. Uses the EMPLOYEE role, whose notifications need no API call.
 */

function Bell() {
  const { notifications, isLoading, unreadCount, isRead, markRead, markAllRead } =
    useNotifications();
  if (isLoading) return <p>loading</p>;
  return (
    <div>
      <p>unread:{unreadCount}</p>
      <p>total:{notifications.length}</p>
      <ul>
        {notifications.map((n) => (
          <li key={n.id} data-ts={n.timestamp.getTime()}>
            {n.id}:{isRead(n.id) ? "read" : "unread"}
          </li>
        ))}
      </ul>
      {notifications[0] && (
        <button type="button" onClick={() => markRead(notifications[0].id)}>
          read first
        </button>
      )}
      <button type="button" onClick={markAllRead}>
        read all
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  signInAs("EMPLOYEE");
});

it("lists notifications newest first, all unread to begin with", async () => {
  renderWithProviders(<Bell />);

  const items = await screen.findAllByRole("listitem");
  const times = items.map((li) => Number(li.getAttribute("data-ts")));
  expect(times).toEqual([...times].sort((a, b) => b - a));
  expect(screen.getByText(`unread:${items.length}`)).toBeInTheDocument();
});

it("remembers what was read, per user, in localStorage", async () => {
  renderWithProviders(<Bell />);
  const items = await screen.findAllByRole("listitem");

  act(() => screen.getByText("read first").click());

  expect(screen.getByText(`unread:${items.length - 1}`)).toBeInTheDocument();
  expect(localStorage.getItem("notifications-read:user-1")).toContain(
    items[0].textContent!.split(":")[0]
  );
});

it("marks everything read at once", async () => {
  renderWithProviders(<Bell />);
  await screen.findAllByRole("listitem");

  act(() => screen.getByText("read all").click());

  expect(screen.getByText("unread:0")).toBeInTheDocument();
});

it("shows nothing when nobody is signed in", () => {
  signOut();
  renderWithProviders(<Bell />);

  expect(screen.getByText("total:0")).toBeInTheDocument();
});
