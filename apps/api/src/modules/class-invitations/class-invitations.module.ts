import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { ClassInvitationsController } from "./class-invitations.controller";
import { ClassInvitationsService } from "./class-invitations.service";
import { DeliveryService } from "./delivery.service";
import { ClassInvitationDeliveryWorker } from "./delivery.worker";
import { InvitationRateLimit } from "./invitation-rate-limit";

/** Class invitations (003 US2, US3, US5): creation, delivery with retries, resend, cancel and acceptance. */
@Module({
  imports: [ClassesModule],
  controllers: [ClassInvitationsController],
  providers: [ClassInvitationsService, DeliveryService, ClassInvitationDeliveryWorker, InvitationRateLimit],
})
export class ClassInvitationsModule {}
