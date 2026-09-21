import { Module } from "@nestjs/common";
import { RoleGrantAcceptance } from "./role-grant-acceptance.service";

@Module({
  providers: [RoleGrantAcceptance],
  exports: [RoleGrantAcceptance],
})
export class ProvisioningModule {}
