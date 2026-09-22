/** Application version, set at build time by next.config.js (`0.1.42 (b3924e0)`). */
export function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || "dev";
}
