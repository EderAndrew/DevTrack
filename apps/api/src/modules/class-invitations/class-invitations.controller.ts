import { Controller, Param, Post } from "@nestjs/common";
import { type ClassInvitationView, type InviteStudentRequest, InviteStudentRequestSchema, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ClassInvitationsService } from "./class-invitations.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** Invitations of a teacher's own class (003 contracts/http-api.md, "Convites da turma"). */
@Controller("classes/:id/invitations")
export class ClassInvitationsController {
  constructor(private readonly invitations: ClassInvitationsService) {}

  @Post()
  @RequirePermissions("turmas.convidar_aluno")
  invite(
    @Param("id", idPipe) classId: string,
    @ZodBody(InviteStudentRequestSchema) body: InviteStudentRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassInvitationView> {
    return this.invitations.invite(ctx.auth!, classId, body.email, ctx.requestId);
  }
}
