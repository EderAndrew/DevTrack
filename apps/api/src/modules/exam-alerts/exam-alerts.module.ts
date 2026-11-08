import { Module } from "@nestjs/common";
import { PushModule } from "../../platform/push/push.module";
import { AttemptIntegrityModule } from "../attempt-integrity/attempt-integrity.module";
import { ExamAlertOutbox } from "./exam-alert-outbox";
import { ExamAlertWorker } from "./exam-alert.worker";
import { MobileDevicesController } from "./mobile-devices.controller";
import { MobileDevicesService } from "./mobile-devices.service";
import { MobileExamsController } from "./mobile-exams.controller";
import { MobileExamsService } from "./mobile-exams.service";
import { MobileWriteLimit } from "./mobile-write-limit";
import { AlertRecipients } from "./recipients";

/**
 * The exam monitor on the phone (024): the app's device registration and exam list, the alert outbox
 * registered on `attempt-integrity`'s `ExamAlertSink` and its worker (US3); the mute arrives with US4. It only reads the exam: no grading, decision, pause or
 * exam write (`exam-alerts-boundary.spec.ts`), and `attempt-integrity` never imports it.
 */
@Module({
  imports: [AttemptIntegrityModule, PushModule],
  controllers: [MobileDevicesController, MobileExamsController],
  providers: [MobileDevicesService, MobileExamsService, MobileWriteLimit, AlertRecipients, ExamAlertWorker, ExamAlertOutbox],
  exports: [ExamAlertWorker],
})
export class ExamAlertsModule {}
