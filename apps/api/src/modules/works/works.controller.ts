import { Controller, Get, Param, Post } from "@nestjs/common";
import {
  type CreateWorkRequest,
  CreateWorkRequestSchema,
  type ProgrammingLanguageList,
  UuidSchema,
  type WorkTeacherView,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import {
  ZodBody,
  ZodValidationPipe,
} from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { WorksService } from "./works.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's own works (011 contracts/http-api.md, "Works"); other teachers' are 404. */
@Controller("works")
export class WorksController {
  constructor(private readonly works: WorksService) {}

  /** A manual work, DRAFT or APPROVED at the teacher's choice; origin MANUAL, no AI (US1). */
  @Post()
  @RequirePermissions("trabalhos.criar")
  create(
    @ZodBody(CreateWorkRequestSchema) body: CreateWorkRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.create(ctx.auth!, body, ctx.requestId);
  }

  /** The active languages of the shared catalog (research W18); declared before `:id`. */
  @Get("programming-languages")
  @RequirePermissions("trabalhos.visualizar")
  programmingLanguages(): Promise<ProgrammingLanguageList> {
    return this.works.programmingLanguages();
  }

  @Get(":id")
  @RequirePermissions("trabalhos.visualizar")
  get(
    @Param("id", idPipe) id: string,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.getForTeacher(ctx.auth!.userId, id);
  }
}
