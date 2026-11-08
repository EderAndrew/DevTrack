import { Module } from "@nestjs/common";

/**
 * The teacher's discreet warning to one student in an exam (025 research N1–N7): sent only from the app's bell
 * (`@MobileOnly()`, `provas.avisos.enviar`), polled and dismissed by the student on the exam page. It only reads
 * the exam — no AI, push, mail, grading, decisions, attendance or monitoring code, and no write to the exam's
 * tables (`exam-nudges-boundary.spec.ts`). Other modules reach it only through the pure `nudge-status.ts` and
 * `views.ts`. The routes arrive with the stories (US1 send, US2 the student's poll and dismissal).
 */
@Module({})
export class ExamNudgesModule {}
