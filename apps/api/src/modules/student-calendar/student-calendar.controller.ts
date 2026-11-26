import { Controller, Get, Param } from "@nestjs/common";
import { type StudentCalendar, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { StudentCalendarService } from "./student-calendar.service";

/** "Seu calendário de aulas" (031 contracts/http-api.md); the student comes from the session only. */
@Controller("me/classes")
export class StudentCalendarController {
  constructor(private readonly calendar: StudentCalendarService) {}

  /** A malformed id is `400` before any query; the enrollment check answers `404`. */
  @Get(":classId/calendar")
  @RequirePermissions("calendario.turma.visualizar")
  get(
    @Param("classId", new ZodValidationPipe(UuidSchema)) classId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentCalendar> {
    return this.calendar.read(ctx.auth!.userId, classId);
  }
}
