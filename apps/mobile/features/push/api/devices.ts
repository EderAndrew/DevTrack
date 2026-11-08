import { type MobileDevice, MobileDeviceSchema, type MobilePlatform } from "@repo/contracts";
import { apiClient } from "../../../lib/api/instance";

/** `PUT /mobile/device` (024/FR-018): the phone's Expo push token for this session. */
export function registerDevice(pushToken: string, platform: MobilePlatform): Promise<MobileDevice> {
  return apiClient().request("PUT", "/mobile/device", { body: { pushToken, platform }, schema: MobileDeviceSchema });
}
