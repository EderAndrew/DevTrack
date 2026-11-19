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

/** Invitations of a turma, the MANAGER's (003 "Convites da turma"; 027 contracts/http-api.md "MANAGER — turma"). */
@Controller("cohorts/:id/invitations")
export class ClassInvitationsController {
  constructor(private readonly invitations: ClassInvitationsService) {}

  @Get()
  @RequirePermissions("turmas.visualizar")
  list(
    @Param("id", idPipe) cohortId: string,
    @Query(new ZodValidationPipe(ClassInvitationListQuerySchema)) query: ClassInvitationListQuery,
  ): Promise<ClassInvitationPage> {
    return this.invitations.list(cohortId, query);
  }

  @Post()
  @RequirePermissions("turmas.convidar_aluno")
  invite(
    @Param("id", idPipe) cohortId: string,
    @ZodBody(InviteStudentRequestSchema) body: InviteStudentRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.invite(ctx.auth!, cohortId, body.email, ctx.requestId);
  }

  @Post(":invitationId/resend")
  @RequirePermissions("turmas.reenviar_convite")
  @HttpCode(200)
  resend(
    @Param("id", idPipe) cohortId: string,
    @Param("invitationId", idPipe) invitationId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.resend(ctx.auth!, cohortId, invitationId, ctx.requestId);
  }

  @Post(":invitationId/cancel")
  @RequirePermissions("turmas.cancelar_convite")
  @HttpCode(200)
  cancel(
    @Param("id", idPipe) cohortId: string,
    @Param("invitationId", idPipe) invitationId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.cancel(ctx.auth!, cohortId, invitationId, ctx.requestId);
  }
}
