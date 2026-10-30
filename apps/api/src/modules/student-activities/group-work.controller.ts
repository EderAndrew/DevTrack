import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { type GroupCandidates, type GroupEditingRequest, GroupEditingRequestSchema, type StudentActivity, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { GroupWorkService } from "./group-work.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The student's group routes (023 contracts/http-api.md); identity from the session only, never a leader or group id. */
@Controller("me/activities/:activityId/group")
export class GroupWorkController {
  constructor(private readonly groupWork: GroupWorkService) {}

  @Get("candidates")
  @RequirePermissions("atividades.proprias.visualizar")
  candidates(@Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<GroupCandidates> {
    return this.groupWork.candidates(ctx.auth!.userId, activityId, ctx.requestId);
  }

  @Post("editing")
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  editing(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(GroupEditingRequestSchema) body: GroupEditingRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivity> {
    return this.groupWork.changeEditing(ctx.auth!.userId, activityId, body, ctx.requestId);
  }
}
