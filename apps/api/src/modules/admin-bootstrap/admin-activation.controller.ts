import { Controller, HttpCode, Post } from "@nestjs/common";
import {
  type AdminActivated,
  type AdminActivationPreview,
  type AdminActivationRequest,
  AdminActivationRequestSchema,
  type TokenRequest,
  TokenRequestSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { AdminActivationService } from "./admin-activation.service";

/**
 * Public with an optional session (the SIGN_IN_REQUIRED branch uses it). The only public
 * routes that concern ADMIN, and they only complete a bootstrap issued by the operator.
 */
@Controller("admin-activation")
@Public()
export class AdminActivationController {
  constructor(private readonly activation: AdminActivationService) {}

  @Post("preview")
  @HttpCode(200)
  preview(@ZodBody(TokenRequestSchema) body: TokenRequest, @Ctx() ctx: RequestContext): Promise<AdminActivationPreview> {
    return this.activation.preview(body.token, ctx);
  }

  @Post()
  @HttpCode(200)
  activate(
    @ZodBody(AdminActivationRequestSchema) body: AdminActivationRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<AdminActivated> {
    return this.activation.activate(body.token, body.password, ctx);
  }
}
