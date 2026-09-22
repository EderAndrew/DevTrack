import { Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { passwordInputSchema, tokenSchema } from "../../platform/http/schemas";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { AdminActivationService } from "./admin-activation.service";

const previewSchema = z.strictObject({ token: tokenSchema });
const activateSchema = z.strictObject({ token: tokenSchema, password: passwordInputSchema.optional() });

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
  preview(@ZodBody(previewSchema) body: z.output<typeof previewSchema>, @Ctx() ctx: RequestContext) {
    return this.activation.preview(body.token, ctx);
  }

  @Post()
  @HttpCode(200)
  activate(@ZodBody(activateSchema) body: z.output<typeof activateSchema>, @Ctx() ctx: RequestContext) {
    return this.activation.activate(body.token, body.password, ctx);
  }
}
