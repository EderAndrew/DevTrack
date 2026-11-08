import { Controller, Get } from "@nestjs/common";
import type { MobileExamList } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { MobileAccess, RequirePermissions } from "../access-control/decorators";
import { MobileExamsService } from "./mobile-exams.service";

/** 024/US1–US2: the app's list of the teacher's exams in progress (contracts/http-api.md). */
@Controller("mobile/exams")
export class MobileExamsController {
  constructor(private readonly exams: MobileExamsService) {}

  @Get()
  @RequirePermissions("chamada.registrar")
  @MobileAccess()
  list(@Ctx() ctx: RequestContext): Promise<MobileExamList> {
    return this.exams.list(ctx.auth!.userId);
  }
}
