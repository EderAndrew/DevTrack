import { Controller, Get } from "@nestjs/common";
import type { MeView } from "@repo/contracts";
import { type RequestContext, Ctx } from "../../platform/http/request-context";
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
}
