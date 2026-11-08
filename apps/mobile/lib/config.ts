import Constants from "expo-constants";

/**
 * The API's origin (contracts/configuration.md), from `app.config.ts`'s `extra.apiOrigin`, set per EAS
 * profile; https in every profile but development (the config refuses otherwise).
 */
export function apiOrigin(): string {
  const value = (Constants.expoConfig?.extra as { apiOrigin?: unknown } | undefined)?.apiOrigin;
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) throw new Error("apiOrigin ausente na configuração do app");
  return new URL(value).origin;
}
