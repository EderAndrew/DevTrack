import { Controller, HttpCode, Post } from "@nestjs/common";
import {
  type AcceptInvitationRequest,
  AcceptInvitationRequestSchema,
  type InvitationAccepted,
  type InvitationPreview,
  type TokenRequest,
  TokenRequestSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { InvitationAcceptanceService } from "./invitation-acceptance.service";

/** Public with an optional session: the SIGN_IN_REQUIRED branch relies on it (FR-047). */
@Controller("invitations")
@Public()
export class InvitationAcceptanceController {
  constructor(private readonly acceptance: InvitationAcceptanceService) {}

  @Post("preview")
  @HttpCode(200)
  preview(@ZodBody(TokenRequestSchema) body: TokenRequest, @Ctx() ctx: RequestContext): Promise<InvitationPreview> {
    return this.acceptance.preview(body.token, ctx);
  }

  @Post("accept")
  @HttpCode(200)
  accept(
    @ZodBody(AcceptInvitationRequestSchema) body: AcceptInvitationRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<InvitationAccepted> {
    return this.acceptance.accept(body.token, body.password, ctx);
  }
}
