import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import { type RequestHelp, RequestHelpSchema, type StudentHelpItem, type StudentHelpState, UuidSchema } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { WorkHelpService } from "./work-help.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The student's AI help (015 contracts/http-api.md, "Student routes"); identity from the session only. */
@Controller("me/activities/:activityId/attempt/help")
export class WorkHelpController {
  constructor(private readonly help: WorkHelpService) {}

  /** 202 for a new request; 200 when the same key returns the existing one. */
  @Post()
  @RequirePermissions("ia.ajuda.pedir")
  async request(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(RequestHelpSchema) body: RequestHelp,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentHelpItem> {
    const { item, created } = await this.help.request(ctx.auth!, activityId, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return item;
  }

  @Get()
  @RequirePermissions("ia.ajuda.pedir")
  state(@Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<StudentHelpState> {
    return this.help.state(ctx.auth!.userId, activityId, ctx.requestId);
  }
}
