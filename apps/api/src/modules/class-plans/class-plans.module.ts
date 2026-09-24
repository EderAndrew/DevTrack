import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { SubjectsModule } from "../subjects/subjects.module";

/** Class calendar, plan and topics (004 US4–US7). Filled by those stories. */
@Module({
  imports: [ClassesModule, SubjectsModule],
})
export class ClassPlansModule {}
