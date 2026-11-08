/**
 * The app's only network entry point (024 contracts/mobile-ui.md, research Y4), mirroring the web's
 * `lib/api/client.ts`: native `fetch` straight to the API's HTTPS origin, the mobile session as
 * `Authorization: Bearer`, never a cookie. Unsafe methods always send `Content-Type: application/json`
 * (`{}` when there is no body), as the API's `OriginGuard` requires. Every non-2xx answer becomes an
 * `ApiError` with the API's code; a success is parsed against the contract's schema. A `401` anywhere
 * reports the session as ended (`onUnauthorized`), so the app returns to "Entrar".
 */
import type { ErrorDetails } from "@repo/contracts";
import type { z } from "zod";

/** Client-side codes, outside the contract. */
export const NETWORK_ERROR = "NETWORK_ERROR";
export const UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE";

export class ApiError extends Error {
  constructor(
    /** HTTP status; `0` when the request never got an answer. */
    readonly status: number,
    /** The API's code (e.g. `MOBILE_NOT_ALLOWED`) or a client-side one. */
    readonly code: string,
    message: string,
    /** Seconds from `Retry-After`, for `429 RATE_LIMITED`. */
    readonly retryAfterSeconds: number | null = null,
    readonly details: ErrorDetails | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiClientOptions {
  /** The API's origin; requests go to `${origin}/api${path}`. */
  origin: string;
  /** The mobile session's secret, or null before the login. */
  getToken: () => Promise<string | null>;
  /** Called once per `401` answered to a request that carried a session. */
  onUnauthorized: () => void;
  fetch?: typeof fetch;
}

export interface RequestOptions<T> {
  body?: unknown;
  /** The contract's schema of the success body; omitted for `204`. */
  schema?: z.ZodType<T>;
  /** Send without the session (the login). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T = void>(method: Method, path: string, options?: RequestOptions<T>): Promise<T>;
}

function retryAfter(header: string | null): number | null {
  const seconds = header ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorFrom(status: number, payload: unknown, retryAfterHeader: string | null): ApiError {
  if (typeof payload === "object" && payload !== null) {
    const body = payload as Record<string, unknown>;
    if (typeof body.statusCode === "number" && typeof body.code === "string" && typeof body.message === "string") {
      return new ApiError(body.statusCode, body.code, body.message, retryAfter(retryAfterHeader), (body.details as ErrorDetails | undefined) ?? null);
    }
  }
  return new ApiError(status, UNEXPECTED_RESPONSE, `Unexpected response (${status})`, retryAfter(retryAfterHeader));
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchFn = options.fetch ?? fetch;
  const base = `${new URL(options.origin).origin}/api`;

  return {
    async request<T>(method: Method, path: string, request: RequestOptions<T> = {}): Promise<T> {
      if (!path.startsWith("/") || path.startsWith("//")) throw new Error(`caminho inválido: ${path}`);
      const headers: Record<string, string> = { Accept: "application/json" };
      const unsafe = method !== "GET";
      if (unsafe) headers["Content-Type"] = "application/json";
      const token = request.anonymous ? null : await options.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      let response: Response;
      try {
        response = await fetchFn(`${base}${path}`, {
          method,
          headers,
          body: unsafe ? JSON.stringify(request.body ?? {}) : undefined,
          signal: request.signal,
          credentials: "omit",
          redirect: "error",
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new ApiError(0, NETWORK_ERROR, "Network error");
      }

      const payload = parseJson(await response.text());
      if (!response.ok) {
        if (response.status === 401 && token) options.onUnauthorized();
        throw errorFrom(response.status, payload, response.headers.get("Retry-After"));
      }
      if (!request.schema) return undefined as T;
      const parsed = request.schema.safeParse(payload);
      if (!parsed.success) throw new ApiError(response.status, UNEXPECTED_RESPONSE, "Unexpected response body");
      return parsed.data;
    },
  };
}
