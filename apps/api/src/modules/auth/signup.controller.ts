import { Controller, HttpCode, Post } from "@nestjs/common";
import {
  type EmailVerifiedResponse,
  type PublicAccepted,
  type ResendVerificationRequest,
  ResendVerificationRequestSchema,
  type SignupRequest,
  SignupRequestSchema,
  type VerifyEmailRequest,
  VerifyEmailRequestSchema,
} from "@repo/contracts";
import { type RequestContext, Ctx } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { EmailVerificationService } from "./email-verification.service";
import { SignupService } from "./signup.service";

@Controller("auth")
@Public()
export class SignupController {
  constructor(
    private readonly signups: SignupService,
    private readonly verification: EmailVerificationService,
  ) {}

  @Post("signup")
  @HttpCode(202)
  /** Strict: role, roles, permissions, isAdmin or any other field → 400 (FR-010). */
  signup(@ZodBody(SignupRequestSchema) body: SignupRequest, @Ctx() ctx: RequestContext): Promise<PublicAccepted> {
    return this.signups.signup(body, ctx);
  }

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
