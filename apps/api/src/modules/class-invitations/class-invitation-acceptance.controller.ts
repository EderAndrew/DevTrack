import { Controller, HttpCode, Post, Res } from "@nestjs/common";
import {
  type AcceptClassInvitationRequest,
  AcceptClassInvitationRequestSchema,
  type ClassInvitationAccepted,
  type ClassInvitationPreview,
  type TokenRequest,
  TokenRequestSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { SessionCookie } from "../auth/session-cookie";
import { ClassInvitationAcceptanceService } from "./class-invitation-acceptance.service";

/**
 * Public class invitation page (003 D11) with an optional session: SIGN_IN_REQUIRED relies on
 * it. The response object is used only to set the session cookie of a new or claimed account.
 */
@Controller("class-invitations")
@Public()
export class ClassInvitationAcceptanceController {
  constructor(private readonly acceptance: ClassInvitationAcceptanceService) {}

  @Post("preview")
  @HttpCode(200)
  preview(@ZodBody(TokenRequestSchema) body: TokenRequest, @Ctx() ctx: RequestContext): Promise<ClassInvitationPreview> {
    return this.acceptance.preview(body.token, ctx);
  }

  @Post("accept")
  @HttpCode(200)
  async accept(
    @ZodBody(AcceptClassInvitationRequestSchema) body: AcceptClassInvitationRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClassInvitationAccepted> {
    const { result, session } = await this.acceptance.accept(body, ctx);
    if (session) SessionCookie.set(res, session.secret, session.absoluteExpiresAt);
    return result;
  }
}
