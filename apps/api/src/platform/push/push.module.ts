import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { ExpoPushClient } from "./expo-push.client";
import { PushClient } from "./push-client";

/**
 * Push delivery (024 research Y6): the `PushClient` port backed by Expo Push. The tests replace the
 * provider with `FakePushClient` (`test/fixtures/push/fake-push-client.ts`); nothing here reads a domain module.
 */
@Module({
  providers: [
    {
      provide: PushClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new ExpoPushClient({ baseUrl: config.push.baseUrl, accessToken: config.push.accessToken }),
    },
  ],
  exports: [PushClient],
})
export class PushModule {}
