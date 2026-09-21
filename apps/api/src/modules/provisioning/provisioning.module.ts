import { Module } from "@nestjs/common";
import { InvitationAcceptanceController } from "./invitation-acceptance.controller";
import { InvitationAcceptanceService } from "./invitation-acceptance.service";
import { InvitationService } from "./invitation.service";
import { ManagersController } from "./managers.controller";
import { ManagersService } from "./managers.service";
import { RoleGrantAcceptance } from "./role-grant-acceptance.service";

/** Invitations (creation, lifecycle, acceptance) and the ADMIN's management of MANAGERs. */
@Module({
  controllers: [InvitationAcceptanceController, ManagersController],
  providers: [RoleGrantAcceptance, InvitationService, InvitationAcceptanceService, ManagersService],
  exports: [RoleGrantAcceptance, InvitationService],
})
export class ProvisioningModule {}
