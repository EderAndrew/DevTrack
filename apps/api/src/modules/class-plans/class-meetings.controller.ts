import { Controller, Get, Param, Put } from "@nestjs/common";
import {
  type ClassMeetingList,
  type UpdateClassMeetingsRequest,
  UpdateClassMeetingsRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ClassMeetingsService } from "./class-meetings.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The class calendar (004 contracts/http-api.md, "Calendário"). */
@Controller("classes/:id/meetings")
export class ClassMeetingsController {
  constructor(private readonly meetings: ClassMeetingsService) {}

  @Get()
  @RequirePermissions("planejamento.visualizar")
  list(@Param("id", idPipe) classId: string, @Ctx() ctx: RequestContext): Promise<ClassMeetingList> {
    return this.meetings.list(ctx.auth!.userId, classId);
  }

  /** Adds and removes dates in one save, with the resolutions of the removed meetings' topics. */
  @Put()
  @RequirePermissions("calendario.gerenciar")
  update(
    @Param("id", idPipe) classId: string,
    @ZodBody(UpdateClassMeetingsRequestSchema) body: UpdateClassMeetingsRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassMeetingList> {
    return this.meetings.update(ctx.auth!, classId, body, ctx.requestId);
  }
}
