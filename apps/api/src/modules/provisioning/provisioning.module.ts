import { Module } from "@nestjs/common";
import { InvitationAcceptanceController } from "./invitation-acceptance.controller";
import { InvitationAcceptanceService } from "./invitation-acceptance.service";
import { InvitationMailSubject } from "./invitation.mail-subject";
import { InvitationService } from "./invitation.service";
import { ManagersController } from "./managers.controller";
import { ManagersService } from "./managers.service";
import { RoleGrantAcceptance } from "./role-grant-acceptance.service";
import { TeacherInvitationsController } from "./teacher-invitations.controller";
import { TeacherInvitationsService } from "./teacher-invitations.service";
import { TeachersController } from "./teachers.controller";
import { TeachersService } from "./teachers.service";

/** Invitations (creation, lifecycle, acceptance), MANAGER management (ADMIN) and the teaching registry. */
@Module({
  controllers: [InvitationAcceptanceController, ManagersController, TeachersController, TeacherInvitationsController],
  providers: [
    RoleGrantAcceptance,
    InvitationService,
    InvitationMailSubject,
    InvitationAcceptanceService,
    ManagersService,
    TeachersService,
    TeacherInvitationsService,
  ],
  exports: [RoleGrantAcceptance, InvitationService],
})
export class ProvisioningModule {}
