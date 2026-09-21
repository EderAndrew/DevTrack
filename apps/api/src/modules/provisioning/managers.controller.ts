import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { emailSchema, nameSchema, uuidSchema } from "../../platform/http/schemas";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import type { InvitationView } from "./invitation.view";
import { type ManagerView, ManagersService } from "./managers.service";

const inviteSchema = z.strictObject({ email: emailSchema, displayName: nameSchema });
export const invitationStatusQuerySchema = z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]).optional();
const idPipe = new ZodValidationPipe(uuidSchema);
const statusPipe = new ZodValidationPipe(invitationStatusQuerySchema);

@Controller()
export class ManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Get("managers")
  @RequirePermissions("managers.visualizar")
  async list(): Promise<{ items: ManagerView[] }> {
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
    @Query("status", statusPipe) status: z.output<typeof invitationStatusQuerySchema>,
  ): Promise<{ items: InvitationView[] }> {
    return { items: await this.managers.listInvitations(status) };
  }

  @Post("manager-invitations")
  @RequirePermissions("managers.convidar")
  @HttpCode(201)
  invite(@ZodBody(inviteSchema) body: z.output<typeof inviteSchema>, @Ctx() ctx: RequestContext): Promise<InvitationView> {
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
