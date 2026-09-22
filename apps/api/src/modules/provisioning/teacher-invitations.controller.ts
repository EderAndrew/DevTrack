import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type InvitationListQuery,
  InvitationListQuerySchema,
  type InvitationListResponse,
  type InvitationView,
  type InviteRequest,
  InviteRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { TeacherInvitationsService } from "./teacher-invitations.service";

const idPipe = new ZodValidationPipe(UuidSchema);
/** Only `?status=` is read, as in Phase 001 (catalog note of contracts-package.md). */
const statusPipe = new ZodValidationPipe(InvitationListQuerySchema.shape.status);

@Controller("teacher-invitations")
export class TeacherInvitationsController {
  constructor(private readonly teacherInvitations: TeacherInvitationsService) {}

  @Get()
  @RequirePermissions("professores.visualizar")
  async list(
    @Query("status", statusPipe) status: InvitationListQuery["status"],
  ): Promise<InvitationListResponse> {
    return { items: await this.teacherInvitations.list(status) };
  }

  @Post()
  @RequirePermissions("professores.convidar")
  @HttpCode(201)
  invite(@ZodBody(InviteRequestSchema) body: InviteRequest, @Ctx() ctx: RequestContext): Promise<InvitationView> {
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
