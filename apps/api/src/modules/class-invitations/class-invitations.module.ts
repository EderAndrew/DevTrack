import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClassesModule } from "../classes/classes.module";
import { ProvisioningModule } from "../provisioning/provisioning.module";
import { ClassInvitationAcceptanceController } from "./class-invitation-acceptance.controller";
import { ClassInvitationAcceptanceService } from "./class-invitation-acceptance.service";
import { ClassInvitationsController } from "./class-invitations.controller";
import { ClassInvitationsService } from "./class-invitations.service";
import { DeliveryService } from "./delivery.service";
import { ClassInvitationDeliveryWorker } from "./delivery.worker";
import { InvitationRateLimit } from "./invitation-rate-limit";

/** Class invitations (003 US2, US3, US5): creation, delivery with retries, resend, cancel and acceptance. */
@Module({
  imports: [ClassesModule, AuthModule, ProvisioningModule],
  controllers: [ClassInvitationsController, ClassInvitationAcceptanceController],
  providers: [
    ClassInvitationsService,
    ClassInvitationAcceptanceService,
    DeliveryService,
    ClassInvitationDeliveryWorker,
    InvitationRateLimit,
  ],
})
export class ClassInvitationsModule {}
