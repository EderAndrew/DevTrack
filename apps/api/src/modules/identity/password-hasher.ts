import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import * as argon2 from "argon2";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken } from "../../platform/crypto/tokens";

/**
 * Argon2id with parameters from configuration (R4). `needsRehash` lets login upgrade stored
 * hashes when the parameters change; `verifyDummy` spends the same work for unknown e-mails
 * so login latency does not reveal whether an account exists (R16, SC-006).
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private readonly options: argon2.HashOptions & { type: typeof argon2.argon2id; memoryCost: number; timeCost: number; parallelism: number };
  private dummyHash: Promise<string> | null = null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: config.argon2.memoryCost,
      timeCost: config.argon2.timeCost,
      parallelism: config.argon2.parallelism,
    };
  }

  onModuleInit(): void {
    // Precompute at startup so the first unknown-e-mail login costs the same as the others.
    void this.getDummyHash();
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  /** Never throws for a malformed stored hash: it simply does not match. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, {
        memoryCost: this.options.memoryCost,
        timeCost: this.options.timeCost,
        parallelism: this.options.parallelism,
      });
    } catch {
      return true;
    }
  }

  /** Verifies against a precomputed hash; always false. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.getDummyHash(), password);
    return false;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hash(generateToken());
    return this.dummyHash;
  }
}
