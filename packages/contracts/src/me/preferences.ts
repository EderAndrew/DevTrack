import { z } from "zod";

/** 022: the account's theme. `DARK` is the default of every account (research Z1). */
export const UiThemeSchema = z.enum(["DARK", "LIGHT"]);
export type UiTheme = z.infer<typeof UiThemeSchema>;

/** `PATCH /me/preferences`: only the session's own account, never a user id (research Z2). */
export const UpdatePreferencesRequestSchema = z.strictObject({ theme: UiThemeSchema });
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

export const PreferencesViewSchema = z.strictObject({ theme: UiThemeSchema });
export type PreferencesView = z.infer<typeof PreferencesViewSchema>;
