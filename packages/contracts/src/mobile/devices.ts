import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";

// 024 (contracts/http-api.md, data-model.md `mobile_devices`, research Y9).

export const MobilePlatformSchema = z.enum(["ANDROID", "IOS"]);
export type MobilePlatform = z.infer<typeof MobilePlatformSchema>;

/** An Expo push token; the same rule as the CHECK of `mobile_devices.push_token`. */
export const ExpoPushTokenSchema = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/);

/** `PUT /mobile/device`: only the device's push token and platform, never a user or a session. */
export const RegisterMobileDeviceRequestSchema = z.strictObject({
  pushToken: ExpoPushTokenSchema,
  platform: MobilePlatformSchema,
});
export type RegisterMobileDeviceRequest = z.infer<typeof RegisterMobileDeviceRequestSchema>;

/** The token never comes back. */
export const MobileDeviceSchema = z.strictObject({ id: UuidSchema, platform: MobilePlatformSchema });
export type MobileDevice = z.infer<typeof MobileDeviceSchema>;
