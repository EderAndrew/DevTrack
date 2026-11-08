import { apiOrigin } from "../config";
import { type ApiClient, createApiClient } from "./client";

/**
 * The app's single API client (024 contracts/mobile-ui.md). The session provider tells it how to read
 * the secret and what to do on a `401`; the feature `api/` layers call `apiClient()`. Tests swap the client.
 */
let tokenGetter: () => Promise<string | null> = async () => null;
let unauthorizedHandler: () => void = () => {};
let instance: ApiClient | null = null;

export function configureApiSession(options: { getToken: () => Promise<string | null>; onUnauthorized: () => void }): void {
  tokenGetter = options.getToken;
  unauthorizedHandler = options.onUnauthorized;
}

export function apiClient(): ApiClient {
  instance ??= createApiClient({ origin: apiOrigin(), getToken: () => tokenGetter(), onUnauthorized: () => unauthorizedHandler() });
  return instance;
}

/** Tests only: answer every request through a fake client (null restores the real one). */
export function setApiClientForTests(client: ApiClient | null): void {
  instance = client;
}
