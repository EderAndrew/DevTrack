/**
 * Thin fetch wrapper for the DevTrack API (R18). In the browser it calls `/api/*` on this
 * origin (rewritten to the API, R6); on the server pass `baseUrl` and the `cookie` to forward.
 * Every non-2xx answer becomes an `ApiError` carrying the API's `{statusCode, code, message}`;
 * screens show `messageForError(error)` (web catalogue by code), not `error.message`.
 * `apiUpload` sends a `FormData` over `XMLHttpRequest`, the only way to report real upload
 * progress; this file stays the web's only network entry point.
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-serialized, except a `FormData`, sent as is (the browser sets the multipart `Content-Type`). */
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

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function retryAfter(header: string | null): number | null {
  const seconds = header ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function errorFrom(status: number, payload: unknown, retryAfterHeader: string | null): ApiError {
  if (isErrorBody(payload)) {
    return new ApiError(payload.statusCode, payload.code, payload.message, retryAfter(retryAfterHeader));
  }
  return new ApiError(status, UNEXPECTED_RESPONSE, `Unexpected response (${status})`, retryAfter(retryAfterHeader));
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, baseUrl = "/api", cookie, signal } = options;
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!isForm && (body !== undefined || method !== "GET")) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: isForm ? body : body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, NETWORK_ERROR, "Network request failed");
  }

  const payload = parseJson(await response.text());
  if (response.ok) return payload as T;
  throw errorFrom(response.status, payload, response.headers.get("Retry-After"));
}

export interface ApiUploadOptions {
  /** Absolute API base; defaults to `/api`, as in `apiRequest`. */
  baseUrl?: string;
  /** Percentage (0–100) of the request body sent so far; not called when the size is unknown. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * POSTs a multipart `FormData` and reports upload progress. Same outcomes as `apiRequest`:
 * the parsed JSON body, an `ApiError` (`NETWORK_ERROR` when there is no answer) or an
 * `AbortError` when `signal` aborts.
 */
export function apiUpload<T>(path: string, formData: FormData, options: ApiUploadOptions = {}): Promise<T> {
  const { baseUrl = "/api", onProgress, signal } = options;
  const aborted = () => new DOMException("The upload was aborted.", "AbortError");

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();

    xhr.open("POST", `${baseUrl}${path}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const payload = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload as T);
      else reject(errorFrom(xhr.status, payload, xhr.getResponseHeader("Retry-After")));
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR, "Network request failed"));
    xhr.onabort = () => reject(aborted());
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(formData);
  });
}

type Options = Omit<ApiRequestOptions, "method" | "body">;

export const apiClient = {
  get: <T>(path: string, options?: Options) => apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  /** `body`: e.g. the version an exercise was read at (010 research X14). */
  delete: <T>(path: string, body?: unknown, options?: Options) => apiRequest<T>(path, { ...options, method: "DELETE", body }),
  upload: <T>(path: string, formData: FormData, options?: ApiUploadOptions) => apiUpload<T>(path, formData, options),
};
