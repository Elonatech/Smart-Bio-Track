import axios, { AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig, isAxiosError } from "axios";

export const appClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
});

appClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

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