import { Controller, Get, Patch } from "@nestjs/common";
import {
  type MeView,
  type PreferencesView,
  type UpdatePreferencesRequest,
  UpdatePreferencesRequestSchema,
} from "@repo/contracts";
import { type RequestContext, Ctx } from "../../platform/http/request-context";
import { ZodBody } from "../../platform/http/zod-validation.pipe";
import { AllowUnverified } from "../access-control/decorators";
import { MeService } from "./me.service";

@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Available before verification: the user can check their own state (FR-016). */
  @Get()
  @AllowUnverified()
  get(@Ctx() ctx: RequestContext): Promise<MeView> {
    return this.me.get(ctx.auth!.userId);
  }

  /** 022: the own account's theme; any session, also before verification, never another user (research Z2). */
  @Patch("preferences")
  @AllowUnverified()
  updatePreferences(
    @ZodBody(UpdatePreferencesRequestSchema) body: UpdatePreferencesRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<PreferencesView> {
    return this.me.updatePreferences(ctx.auth!.userId, body);
  }
}
