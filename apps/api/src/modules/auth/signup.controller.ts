import { Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { type RequestContext, Ctx } from "../../platform/http/request-context";
import { emailSchema, nameSchema, passwordInputSchema, tokenSchema } from "../../platform/http/schemas";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { Public } from "../access-control/decorators";
import { EmailVerificationService } from "./email-verification.service";
import { type PublicAccepted, SignupService } from "./signup.service";

/** Strict: role, roles, permissions, isAdmin or any other field → 400 (FR-010). */
const signupSchema = z.strictObject({ name: nameSchema, email: emailSchema, password: passwordInputSchema });
const verifySchema = z.strictObject({ token: tokenSchema });
const resendSchema = z.strictObject({ email: emailSchema });

@Controller("auth")
@Public()
export class SignupController {
  constructor(
    private readonly signups: SignupService,
    private readonly verification: EmailVerificationService,
  ) {}

  @Post("signup")
  @HttpCode(202)
  signup(@ZodBody(signupSchema) body: z.output<typeof signupSchema>, @Ctx() ctx: RequestContext): Promise<PublicAccepted> {
    return this.signups.signup(body, ctx);
  }

  @Post("verify-email")
  @HttpCode(200)
  verify(@ZodBody(verifySchema) body: z.output<typeof verifySchema>, @Ctx() ctx: RequestContext) {
    return this.verification.verify(body.token, ctx);
  }

  @Post("verify-email/resend")
  @HttpCode(202)
  resend(@ZodBody(resendSchema) body: z.output<typeof resendSchema>, @Ctx() ctx: RequestContext): Promise<PublicAccepted> {
    return this.verification.resend(body.email, ctx);
  }
}
