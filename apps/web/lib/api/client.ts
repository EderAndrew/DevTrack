/**
 * Thin fetch wrapper for the DevTrack API (R18). In the browser it calls `/api/*` on this
 * origin (rewritten to the API, R6); on the server pass `baseUrl` and the `cookie` to forward.
 * Every non-2xx answer becomes an `ApiError` carrying the API's `{statusCode, code, message}`;
 * screens show `messageForError(error)` (web catalogue by code), not `error.message`.
 */
import type { ErrorBody } from "@repo/contracts";

/** Client-side codes, outside the contract; their texts live in `lib/messages/error-messages.ts`. */
export const NETWORK_ERROR = "NETWORK_ERROR";
export const UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE";

export class ApiError extends Error {
  constructor(
    /** HTTP status; `0` when the request never got an answer. */
    readonly status: number,
    /** Stable code from the API catalogue (e.g. `WEAK_PASSWORD`) or a client-side code. */
    readonly code: string,
    message: string,
    /** Seconds from `Retry-After`, for `429 RATE_LIMITED`. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Absolute API base for server-side calls (e.g. `http://api:4000/api`); defaults to `/api`. */
  baseUrl?: string;
  /** Cookie header to forward on server-side calls. */
  cookie?: string;
  signal?: AbortSignal;
}

/** The contract's error body, but with any `code`: an API newer than this web may send codes it does not know yet. */
type ReceivedErrorBody = Omit<ErrorBody, "code"> & { code: string };

function isErrorBody(value: unknown): value is ReceivedErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.statusCode === "number" && typeof body.code === "string" && typeof body.message === "string";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function retryAfter(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, baseUrl = "/api", cookie, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined || method !== "GET") headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, NETWORK_ERROR, "Network request failed");
  }

  const payload = await readJson(response);
  if (response.ok) return payload as T;

  if (isErrorBody(payload)) {
    throw new ApiError(payload.statusCode, payload.code, payload.message, retryAfter(response));
  }
  throw new ApiError(response.status, UNEXPECTED_RESPONSE, `Unexpected response (${response.status})`, retryAfter(response));
}

type Options = Omit<ApiRequestOptions, "method" | "body">;

export const apiClient = {
  get: <T>(path: string, options?: Options) => apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Options) => apiRequest<T>(path, { ...options, method: "DELETE" }),
};
