import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { hmacKey } from "./tokens";

/** Binds hmacKey() to APP_HMAC_SECRET so callers never handle the secret. */
@Injectable()
export class CryptoService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  hmacKey(scope: string, value: string): string {
    return hmacKey(this.config.hmacSecret, scope, value);
  }
}
