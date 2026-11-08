import { Module } from "@nestjs/common";
import { MobileDevicesController } from "./mobile-devices.controller";
import { MobileDevicesService } from "./mobile-devices.service";
import { MobileExamsController } from "./mobile-exams.controller";
import { MobileExamsService } from "./mobile-exams.service";
import { MobileWriteLimit } from "./mobile-write-limit";

/**
 * The exam monitor on the phone (024): the app's device registration and exam list; the alert outbox,
 * its worker and the mute arrive with US3 and US4. It only reads the exam: no grading, decision, pause or
 * exam write (`exam-alerts-boundary.spec.ts`), and `attempt-integrity` never imports it.
 */
@Module({
  controllers: [MobileDevicesController, MobileExamsController],
  providers: [MobileDevicesService, MobileExamsService, MobileWriteLimit],
})
export class ExamAlertsModule {}
