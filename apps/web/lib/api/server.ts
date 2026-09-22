import { cookies } from "next/headers";
import { ApiError, apiClient } from "./client";

/** Server-side base URL of the API (the rewrite only exists for browser requests). */
export function serverApiBaseUrl(): string {
  return `${(process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "")}/api`;
}

/**
 * GET from a Server Component, forwarding the request's cookie to the API (R18).
 * Returns null when there is no valid session (401); any other failure propagates.
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  try {
    return await apiClient.get<T>(path, { baseUrl: serverApiBaseUrl(), cookie });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
