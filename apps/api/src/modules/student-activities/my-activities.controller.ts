import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  type StudentActivity,
  type StudentActivityListQuery,
  StudentActivityListQuerySchema,
  type StudentActivityPage,
  type StudentDashboard,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { MyActivitiesService } from "./my-activities.service";

/** The student's own activities (012 contracts/http-api.md, "Student routes"); identity from the session only. */
@Controller("me")
export class MyActivitiesController {
  constructor(private readonly myActivities: MyActivitiesService) {}

  @Get("dashboard")
  @RequirePermissions("atividades.proprias.visualizar")
  dashboard(@Ctx() ctx: RequestContext): Promise<StudentDashboard> {
    return this.myActivities.dashboard(ctx.auth!.userId);
  }

  @Get("activities")
  @RequirePermissions("atividades.proprias.visualizar")
  list(
    @Query(new ZodValidationPipe(StudentActivityListQuerySchema)) query: StudentActivityListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivityPage> {
    return this.myActivities.list(ctx.auth!.userId, query);
  }

  @Get("activities/:activityId")
  @RequirePermissions("atividades.proprias.visualizar")
  get(@Param("activityId", new ZodValidationPipe(UuidSchema)) activityId: string, @Ctx() ctx: RequestContext): Promise<StudentActivity> {
    return this.myActivities.get(ctx.auth!.userId, activityId, ctx.requestId);
  }
}
