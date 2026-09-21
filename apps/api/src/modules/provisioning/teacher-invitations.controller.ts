import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { emailSchema, nameSchema, uuidSchema } from "../../platform/http/schemas";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import type { InvitationView } from "./invitation.view";
import { invitationStatusQuerySchema } from "./managers.controller";
import { TeacherInvitationsService } from "./teacher-invitations.service";

const inviteSchema = z.strictObject({ email: emailSchema, displayName: nameSchema });
const idPipe = new ZodValidationPipe(uuidSchema);

@Controller("teacher-invitations")
export class TeacherInvitationsController {
  constructor(private readonly teacherInvitations: TeacherInvitationsService) {}

  @Get()
  @RequirePermissions("professores.visualizar")
  async list(
    @Query("status", new ZodValidationPipe(invitationStatusQuerySchema)) status: z.output<typeof invitationStatusQuerySchema>,
  ): Promise<{ items: InvitationView[] }> {
    return { items: await this.teacherInvitations.list(status) };
  }

  @Post()
  @RequirePermissions("professores.convidar")
  @HttpCode(201)
  invite(@ZodBody(inviteSchema) body: z.output<typeof inviteSchema>, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.teacherInvitations.invite(body, ctx.auth!, ctx.requestId);
  }

  @Post(":id/resend")
  @RequirePermissions("professores.reenviar_convite")
  @HttpCode(200)
  resend(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.teacherInvitations.resend(id, ctx.auth!, ctx.requestId);
  }

  @Post(":id/revoke")
  @RequirePermissions("professores.revogar_convite")
  @HttpCode(200)
  revoke(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<InvitationView> {
    return this.teacherInvitations.revoke(id, ctx.auth!, ctx.requestId);
  }
}
