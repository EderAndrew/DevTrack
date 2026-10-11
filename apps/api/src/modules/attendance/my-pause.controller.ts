import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import { type DeclareExit, DeclareExitSchema, type MyPause, type StudentPause, UuidSchema } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { MyPauseService } from "./my-pause.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** "Sair da sala" (016 contracts/http-api.md, "Student routes"); identity from the session only. */
@Controller("me/activities/:activityId/attempt/pause")
export class MyPauseController {
  constructor(private readonly pauses: MyPauseService) {}

  /** 201 for a new pause; 200 with the same pause when one is already open. */
  @Post()
  @RequirePermissions("atividades.proprias.responder")
  async declare(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(DeclareExitSchema) body: DeclareExit,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentPause> {
    const { pause, created } = await this.pauses.declare(ctx.auth!.userId, activityId, body, ctx.requestId);
    res.status(created ? 201 : 200);
    return pause;
  }

  @Get()
  @RequirePermissions("atividades.proprias.visualizar")
  get(@Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<MyPause> {
    return this.pauses.get(ctx.auth!.userId, activityId, ctx.requestId);
  }
}
