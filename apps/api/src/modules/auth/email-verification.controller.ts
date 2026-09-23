import { Controller, HttpCode, Post } from "@nestjs/common";
import {
  type EmailVerifiedResponse,
  type PublicAccepted,
  type ResendVerificationRequest,
  ResendVerificationRequestSchema,
  type VerifyEmailRequest,
  VerifyEmailRequestSchema,
} from "@repo/contracts";
import { type RequestContext, Ctx } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { EmailVerificationService } from "./email-verification.service";

/**
 * E-mail verification links and their resend (FR-014, FR-015). Public self-signup is gone
 * (003 FR-048): `POST /auth/signup` is not registered and answers 404.
 */
@Controller("auth")
@Public()
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post("verify-email")
  @HttpCode(200)
  verify(@ZodBody(VerifyEmailRequestSchema) body: VerifyEmailRequest, @Ctx() ctx: RequestContext): Promise<EmailVerifiedResponse> {
    return this.verification.verify(body.token, ctx);
  }

  @Post("verify-email/resend")
  @HttpCode(202)
  resend(
    @ZodBody(ResendVerificationRequestSchema) body: ResendVerificationRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<PublicAccepted> {
    return this.verification.resend(body.email, ctx);
  }
}
