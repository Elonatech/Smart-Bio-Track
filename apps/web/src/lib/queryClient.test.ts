import { clearCacheOnSignOut, makeQueryClient } from "./queryClient";
import { useAuthStore, type AuthUser } from "@/lib/store/auth-store";

/**
 * Offices share computers: when one person signs out (or their session
 * expires) the next must never see the last one's cached attendance.
 */

const user = (id: string): AuthUser => ({
  id,
  name: "Ada Okafor",
  email: "ada@example.com",
  role: "EMPLOYEE",
  organizationId: "org-1",
  organizationName: "Acme Ltd",
  departmentId: null,
  departmentName: null,
});

let unsubscribe: () => void = () => {};
afterEach(() => {
  unsubscribe();
  useAuthStore.getState().clearSession();
});

it("empties the cache on sign-out", () => {
  const queryClient = makeQueryClient();
  useAuthStore.getState().login(user("u1"), "token");
  unsubscribe = clearCacheOnSignOut(queryClient);
  queryClient.setQueryData(["attendance", "u1", "today"], { state: "CLOCKED_IN" });

  useAuthStore.getState().clearSession();

  expect(queryClient.getQueryData(["attendance", "u1", "today"])).toBeUndefined();
});

it("empties the cache when a different person signs in", () => {
  const queryClient = makeQueryClient();
  useAuthStore.getState().login(user("u1"), "token");
  unsubscribe = clearCacheOnSignOut(queryClient);
  queryClient.setQueryData(["attendance", "u1", "today"], { state: "CLOCKED_IN" });

  useAuthStore.getState().login(user("u2"), "token");

  expect(queryClient.getQueryData(["attendance", "u1", "today"])).toBeUndefined();
});

it("keeps the cache when only the access token is refreshed", () => {
  const queryClient = makeQueryClient();
  useAuthStore.getState().login(user("u1"), "token");
  unsubscribe = clearCacheOnSignOut(queryClient);
  queryClient.setQueryData(["attendance", "u1", "today"], { state: "CLOCKED_IN" });

  useAuthStore.getState().setAccessToken("new-token");

  expect(queryClient.getQueryData(["attendance", "u1", "today"])).toEqual({ state: "CLOCKED_IN" });
});

it("keeps answers no screen is showing for a working day, not 5 minutes", () => {
  // Found in testing: an hour on another page brought back "Loading…".
  const gcTime = makeQueryClient().getDefaultOptions().queries?.gcTime;
  expect(gcTime).toBe(12 * 60 * 60 * 1000);
});
