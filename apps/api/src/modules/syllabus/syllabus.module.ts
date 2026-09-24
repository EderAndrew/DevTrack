import { Module } from "@nestjs/common";
import { SubjectsModule } from "../subjects/subjects.module";

/** Syllabus documents: upload, processing and reviewed content (004 US2, US3). Filled by those stories. */
@Module({
  imports: [SubjectsModule],
})
export class SyllabusModule {}
