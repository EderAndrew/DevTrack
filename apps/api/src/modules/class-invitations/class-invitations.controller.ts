import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type ClassInvitationListQuery,
  ClassInvitationListQuerySchema,
  type ClassInvitationPage,
  type ClassInvitationView,
  EmptyBodySchema,
  type InviteStudentRequest,
  InviteStudentRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ClassInvitationsService } from "./class-invitations.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** Invitations of a teacher's own class (003 contracts/http-api.md, "Convites da turma"). */
@Controller("classes/:id/invitations")
export class ClassInvitationsController {
  constructor(private readonly invitations: ClassInvitationsService) {}

  @Get()
  @RequirePermissions("turmas.visualizar")
  list(
    @Param("id", idPipe) classId: string,
    @Query(new ZodValidationPipe(ClassInvitationListQuerySchema)) query: ClassInvitationListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationPage> {
    return this.invitations.list(ctx.auth!.userId, classId, query);
  }

  @Post()
  @RequirePermissions("turmas.convidar_aluno")
  invite(
    @Param("id", idPipe) classId: string,
    @ZodBody(InviteStudentRequestSchema) body: InviteStudentRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.invite(ctx.auth!, classId, body.email, ctx.requestId);
  }

  @Post(":invitationId/resend")
  @RequirePermissions("turmas.reenviar_convite")
  @HttpCode(200)
  resend(
    @Param("id", idPipe) classId: string,
    @Param("invitationId", idPipe) invitationId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.resend(ctx.auth!, classId, invitationId, ctx.requestId);
  }

  @Post(":invitationId/cancel")
  @RequirePermissions("turmas.cancelar_convite")
  @HttpCode(200)
  cancel(
    @Param("id", idPipe) classId: string,
    @Param("invitationId", idPipe) invitationId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.cancel(ctx.auth!, classId, invitationId, ctx.requestId);
  }
}
