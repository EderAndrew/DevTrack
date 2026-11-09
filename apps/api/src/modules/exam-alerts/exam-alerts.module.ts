import { Module } from "@nestjs/common";
import { PushModule } from "../../platform/push/push.module";
import { AttemptIntegrityModule } from "../attempt-integrity/attempt-integrity.module";
import { ClassesModule } from "../classes/classes.module";
import { ExamAlertOutbox } from "./exam-alert-outbox";
import { ExamAlertPreferencesController } from "./exam-alert-preferences.controller";
import { ExamAlertPreferencesService } from "./exam-alert-preferences.service";
import { ExamAlertWorker } from "./exam-alert.worker";
import { ExamAlertsRetentionJob } from "./exam-alerts.job";
import { MobileDevicesRetentionJob } from "./mobile-devices.job";
import { MobileDevicesController } from "./mobile-devices.controller";
import { MobileDevicesService } from "./mobile-devices.service";
import { MobileExamsController } from "./mobile-exams.controller";
import { MobileExamsService } from "./mobile-exams.service";
import { MobileWriteLimit } from "../../platform/http/mobile-write-limit";
import { AlertRecipients } from "./recipients";

/**
 * The exam monitor on the phone (024): the app's device registration and exam list, the alert outbox
 * registered on `attempt-integrity`'s `ExamAlertSink` and its worker (US3), and the per-exam mute (US4). It only reads the exam: no grading, decision, pause or
 * exam write (`exam-alerts-boundary.spec.ts`), and `attempt-integrity` never imports it.
 */
@Module({
  imports: [AttemptIntegrityModule, PushModule, ClassesModule],
  controllers: [MobileDevicesController, MobileExamsController, ExamAlertPreferencesController],
  providers: [MobileDevicesService, ExamAlertPreferencesService, MobileExamsService, MobileWriteLimit, AlertRecipients, ExamAlertWorker, ExamAlertOutbox, ExamAlertsRetentionJob, MobileDevicesRetentionJob],
  exports: [ExamAlertWorker],
})
export class ExamAlertsModule {}
