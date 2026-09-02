import axios, { AxiosResponse, isAxiosError } from "axios";
import { useAuthStore } from "./store/auth-store";

export const appClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
});

appClient.interceptors.request.use((config) => {
  // Only fill in Authorization from localStorage if the caller hasn't
  // already set one explicitly. Login/register deliberately pass the
  // token they JUST received (before it's written to localStorage,
  // via login()/registerUser()) — without this check, a stale token
  // still sitting in localStorage from an earlier session silently
  // overwrites that fresh one, causing the very next request
  // (/auth/me) to fail even though registration/login itself
  // succeeded with a perfectly valid token.
  if (!config.headers['Authorization']) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Backend's TransformInterceptor (apps/api/src/common/interceptors/
// transform.interceptor.ts, applied globally in main.ts) wraps every
// successful response as { success, message, data: <actual payload> }.
// Unwrapping it ONCE here means every existing call site in the app —
// `const { data } = await appClient.post(...)`, `res.data` in the
// offices page, etc. — keeps working exactly as if the backend still
// returned the payload directly, instead of every page needing its
// own `.data.data`.
// Endpoints where a 401 means exactly what it says — bad credentials,
// an actually-invalid/expired refresh token — not "my access token
// expired, go refresh it." Retrying these through the refresh flow
// would be nonsensical (login 401ing IS the real answer) or would
// create an infinite loop (refresh 401ing must not trigger... another
// refresh attempt).
const NO_REFRESH_RETRY_PATHS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/register-organization",
  // Step two of org signup. Unauthenticated by nature — a failure here
  // means the emailed token is bad or expired, which no amount of
  // refreshing an access token can fix.
  "/auth/verify-organization",
  "/auth/register",
];

// Queues concurrent 401s that arrive while a single refresh is already
// in flight, so three simultaneous requests failing at once (common —
// a page firing off several API calls together) trigger ONE refresh
// call, not three racing each other.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Deliberately NOT using `appClient` here — that would re-enter this
  // same response interceptor and could recurse. A plain axios POST,
  // straight to the backend, sidesteps that entirely.
  const res = await axios.post(
    `${appClient.defaults.baseURL}/auth/refresh`,
    { refreshToken }
  );
  const body = res.data as { data?: { accessToken: string; refreshToken: string } };
  const tokens = body.data ?? (res.data as { accessToken: string; refreshToken: string });

  // Refresh rotates BOTH tokens server-side (the old refresh token is
  // revoked) — save both, and update the in-memory auth store too, not
  // just localStorage, so the rest of the app (e.g. DashboardNavbar
  // reading the current user) doesn't go stale.
  const currentUser = useAuthStore.getState().user;
  if (currentUser) {
    useAuthStore.getState().login(currentUser, tokens.accessToken, tokens.refreshToken);
  }

  return tokens.accessToken;
}

appClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const body = response.data as unknown;
    if (
      body &&
      typeof body === "object" &&
      "success" in body &&
      "data" in body
    ) {
      response.data = (body as { data: unknown }).data;
    }
    return response;
  },
  async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
    const url = originalRequest?.url ?? "";
    const alreadyRetried = (originalRequest as { _retried?: boolean })?._retried;

    if ( 
      !originalRequest ||
      alreadyRetried ||
      NO_REFRESH_RETRY_PATHS.some((path) => url.includes(path))
    ) {
      return Promise.reject(error);
    }

    try {
      // If a refresh is already underway (from another request that
      // 401'd a moment earlier), reuse it instead of firing a second one.
      refreshPromise ??= refreshAccessToken();
      const newAccessToken = await refreshPromise;
      refreshPromise = null;

      (originalRequest as { _retried?: boolean })._retried = true;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
      return appClient(originalRequest);
    } catch {
      refreshPromise = null;
      // Refresh token is itself invalid/expired — there's no way back
      // in without a real login. Clear the stale session and send the
      // user to sign in, same as a manual logout.
      useAuthStore.getState().logout();
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      return Promise.reject(error);
    }
  }
);

// The backend's AllExceptionsFilter wraps whatever NestJS's built-in
// HttpException.getResponse() returns into its own `message` field.
// For standard exceptions (UnauthorizedException, BadRequestException,
// etc.) that inner value is ITSELF an object shaped like
// { statusCode, message, error } — not a plain string. class-validator
// errors instead make it an array of strings. This function normalizes
// all three shapes down to a single displayable string, so no page has
// to know about this quirk individually.
export function extractErrorMessage(error: unknown): string {
  const fallback = "Something went wrong. Please try again.";

  if (!isAxiosError<{ message?: unknown }>(error)) {
    return fallback;
  }

  const raw = error.response?.data?.message;

  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.join(", ");
  }
  if (raw && typeof raw === "object" && "message" in raw) {
    // The doubly-wrapped case: { statusCode, message, error }.
    // Recurse once in case `message` here is itself an array.
    const inner = (raw as { message: unknown }).message;
    return typeof inner === "string" ? inner : Array.isArray(inner) ? inner.join(", ") : fallback;
  }

  return fallback;
}