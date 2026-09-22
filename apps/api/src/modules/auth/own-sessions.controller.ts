import { Controller, Delete, Get, HttpCode, Param, Res } from "@nestjs/common";
import { type SessionListResponse, type SessionView, UuidSchema } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { OwnSessionsService } from "./own-sessions.service";
import { SessionCookie } from "./session-cookie";

const idPipe = new ZodValidationPipe(UuidSchema);

@Controller("me/sessions")
export class OwnSessionsController {
  constructor(private readonly ownSessions: OwnSessionsService) {}

  @Get()
  @RequirePermissions("sessoes.proprias.listar")
  async list(@Ctx() ctx: RequestContext): Promise<SessionListResponse> {
    return { items: await this.ownSessions.list(ctx.auth!) };
  }

  @Get(":id")
  @RequirePermissions("sessoes.proprias.listar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<SessionView> {
    return this.ownSessions.get(ctx.auth!, id);
  }

  @Delete(":id")
  @RequirePermissions("sessoes.proprias.revogar")
  @HttpCode(204)
  async revoke(
    @Param("id", idPipe) id: string,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { current } = await this.ownSessions.revoke(ctx.auth!, id, ctx.requestId);
    if (current) SessionCookie.clear(res);
  }
}
