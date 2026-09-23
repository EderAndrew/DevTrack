import { Module } from "@nestjs/common";
import { ClassContextPolicy } from "./class-context.policy";

/** A teacher's classes (003 US1): creation, editing, lifecycle and the class context policy. */
@Module({
  providers: [ClassContextPolicy],
  exports: [ClassContextPolicy],
})
export class ClassesModule {}
