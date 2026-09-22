import { Global, Module } from "@nestjs/common";
import { PasswordHasher } from "./password-hasher";
import { loadCommonPasswords, PasswordPolicy } from "./password-policy";
import { ProfileRepository } from "./profile.repository";
import { UserRepository } from "./user.repository";

@Global()
@Module({
  providers: [
    // Loaded eagerly: a missing list must stop the boot (FR-011).
    { provide: PasswordPolicy, useFactory: () => new PasswordPolicy(loadCommonPasswords()) },
    PasswordHasher,
    UserRepository,
    ProfileRepository,
  ],
  exports: [PasswordPolicy, PasswordHasher, UserRepository, ProfileRepository],
})
export class IdentityModule {}
