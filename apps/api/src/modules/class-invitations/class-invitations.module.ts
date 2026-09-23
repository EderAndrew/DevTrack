import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";

/** Class invitations (003 US2, US3, US5): creation, delivery with retries, resend, cancel and acceptance. */
@Module({
  imports: [ClassesModule],
})
export class ClassInvitationsModule {}
