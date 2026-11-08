import * as SecureStore from "expo-secure-store";

/**
 * The mobile session's secret on the device (constitution 3.7.0, research Y3): only in
 * `expo-secure-store` (Android Keystore / iOS Keychain), never in plain storage, logs or the query cache.
 * Readable only while the device is unlocked after its first unlock.
 */
const KEY = "devtrack.mobile-session";
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function readSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY, OPTIONS);
}

export async function saveSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token, OPTIONS);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
