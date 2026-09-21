import { Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { passwordInputSchema, tokenSchema } from "../../platform/http/schemas";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { InvitationAcceptanceService } from "./invitation-acceptance.service";

const previewSchema = z.strictObject({ token: tokenSchema });
const acceptSchema = z.strictObject({ token: tokenSchema, password: passwordInputSchema.optional() });

/** Public with an optional session: the SIGN_IN_REQUIRED branch relies on it (FR-047). */
@Controller("invitations")
@Public()
export class InvitationAcceptanceController {
  constructor(private readonly acceptance: InvitationAcceptanceService) {}

  @Post("preview")
  @HttpCode(200)
  preview(@ZodBody(previewSchema) body: z.output<typeof previewSchema>, @Ctx() ctx: RequestContext) {
    return this.acceptance.preview(body.token, ctx);
  }

  @Post("accept")
  @HttpCode(200)
  accept(@ZodBody(acceptSchema) body: z.output<typeof acceptSchema>, @Ctx() ctx: RequestContext) {
    return this.acceptance.accept(body.token, body.password, ctx);
  }
}
