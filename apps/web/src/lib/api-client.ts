import axios, { AxiosResponse, isAxiosError } from "axios";
import { useAuthStore } from "./store/auth-store";

export const appClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
  // Sends the httpOnly refresh cookie on cross-origin requests. Without this
  // the browser withholds it and every refresh fails with "No refresh token
  // supplied" — the API is on a different port in development, which makes
  // every call cross-origin. The server side of the same handshake is
  // `credentials: true` in main.ts's enableCors.
  withCredentials: true,
});

appClient.interceptors.request.use((config) => {
  // The access token comes from the in-memory store, not localStorage — see
  // auth-store.ts for why nothing is persisted any more.
  //
  // Only filled in when the caller hasn't set one explicitly. The sign-in
  // pages pass the token they JUST received to /auth/me before the store is
  // updated; without this check an older token from the store would overwrite
  // that fresh one and the call would fail despite a successful sign-in.
  if (!config.headers["Authorization"]) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
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

/**
 * Trades the refresh cookie for a new access token.
 *
 * Nothing is passed in and nothing about the refresh token is handled here —
 * the browser attaches the httpOnly cookie, the server rotates it and writes
 * the replacement straight back as another cookie. This code never sees it,
 * which is the entire point of the change: a script that cannot read the
 * token cannot exfiltrate it.
 *
 * Deliberately NOT using `appClient` — that would re-enter the response
 * interceptor below and could recurse. `withCredentials` has to be set
 * explicitly here for the same reason.
 */
export async function refreshAccessToken(): Promise<string> {
  const res = await axios.post(
    `${appClient.defaults.baseURL}/auth/refresh`,
    {},
    { withCredentials: true }
  );

  const body = res.data as { data?: { accessToken: string } };
  const { accessToken } = body.data ?? (res.data as { accessToken: string });

  // Only the access token changes on this side; the user in the store is
  // still current, so replacing the whole session would be churn.
  useAuthStore.getState().setAccessToken(accessToken);

  return accessToken;
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
      // The refresh cookie is itself expired, revoked or absent — there is no
      // way back in without a real sign-in. The server has already cleared the
      // dead cookie (see AuthController.refresh), so this only has to drop the
      // local half.
      useAuthStore.getState().clearSession();
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