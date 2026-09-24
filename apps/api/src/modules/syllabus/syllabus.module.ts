import { Module } from "@nestjs/common";
import { SubjectsModule } from "../subjects/subjects.module";
import { SyllabusDocumentsController } from "./syllabus-documents.controller";
import { SyllabusDocumentsService } from "./syllabus-documents.service";
import { SyllabusProcessingWorker } from "./syllabus-processing.worker";
import { DEFAULT_SYLLABUS_WORKER_PATH, SYLLABUS_WORKER_PATH, SyllabusWorkerRunner } from "./syllabus-worker-runner";

/** Syllabus documents: upload, processing and reviewed content (004 US2, US3). */
@Module({
  imports: [SubjectsModule],
  controllers: [SyllabusDocumentsController],
  providers: [
    { provide: SYLLABUS_WORKER_PATH, useValue: DEFAULT_SYLLABUS_WORKER_PATH },
    SyllabusWorkerRunner,
    SyllabusProcessingWorker,
    SyllabusDocumentsService,
  ],
  exports: [SyllabusProcessingWorker],
})
export class SyllabusModule {}
