import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type InvitationListQuery,
  InvitationListQuerySchema,
  type InvitationListResponse,
  type InvitationView,
  type InviteRequest,
  InviteRequestSchema,
  type ManagerListResponse,
  type ManagerView,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ManagersService } from "./managers.service";

const idPipe = new ZodValidationPipe(UuidSchema);
/** Only `?status=` is read, as in Phase 001 (catalog note of contracts-package.md). */
const statusPipe = new ZodValidationPipe(InvitationListQuerySchema.shape.status);

@Controller()
export class ManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Get("managers")
  @RequirePermissions("managers.visualizar")
  async list(): Promise<ManagerListResponse> {
    return { items: await this.managers.list() };
  }

  @Post("managers/:userId/deactivate")
  @RequirePermissions("managers.desativar")
  @HttpCode(200)
  deactivate(@Param("userId", idPipe) userId: string, @Ctx() ctx: RequestContext): Promise<ManagerView> {
    return this.managers.setStatus(userId, "INACTIVE", ctx.auth!, ctx.requestId);
  }

  @Post("managers/:userId/reactivate")
  @RequirePermissions("managers.ativar")
  @HttpCode(200)
  reactivate(@Param("userId", idPipe) userId: string, @Ctx() ctx: RequestContext): Promise<ManagerView> {
    return this.managers.setStatus(userId, "ACTIVE", ctx.auth!, ctx.requestId);
  }

  @Get("manager-invitations")
  @RequirePermissions("managers.visualizar")
  async listInvitations(
    @Query("status", statusPipe) status: InvitationListQuery["status"],
  ): Promise<InvitationListResponse> {
    return { items: await this.managers.listInvitations(status) };
  }

  @Post("manager-invitations")
  @RequirePermissions("managers.convidar")
  @HttpCode(201)
  invite(@ZodBody(InviteRequestSchema) body: InviteRequest, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.managers.invite(body, ctx.auth!, ctx.requestId);
  }

  @Post("manager-invitations/:id/resend")
  @RequirePermissions("managers.reenviar_convite")
  @HttpCode(200)
  resend(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.managers.resend(id, ctx.auth!, ctx.requestId);
  }

  @Post("manager-invitations/:id/revoke")
  @RequirePermissions("managers.revogar_convite")
  @HttpCode(200)
  revoke(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.managers.revoke(id, ctx.auth!, ctx.requestId);
  }
}
