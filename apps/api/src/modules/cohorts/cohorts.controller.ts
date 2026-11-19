import { Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type ChangeCohortStatusRequest,
  ChangeCohortStatusRequestSchema,
  type CohortDetail,
  type CohortListQuery,
  CohortListQuerySchema,
  type CohortPage,
  type CohortView,
  type CreateCohortRequest,
  CreateCohortRequestSchema,
  type UpdateCohortRequest,
  UpdateCohortRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { CohortsService } from "./cohorts.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The MANAGER's (and the ADMIN's) turmas (027 contracts/http-api.md, "MANAGER — turma"). No DELETE (FR-008);
 * the invitations and the enrollments of a turma join in US2/US5.
 */
@Controller("cohorts")
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get()
  @RequirePermissions("turmas.visualizar")
  list(@Query(new ZodValidationPipe(CohortListQuerySchema)) query: CohortListQuery): Promise<CohortPage> {
    return this.cohorts.list(query);
  }

  @Post()
  @RequirePermissions("turmas.criar")
  create(@ZodBody(CreateCohortRequestSchema) body: CreateCohortRequest, @Ctx() ctx: RequestContext): Promise<CohortView> {
    return this.cohorts.create(ctx.auth!, body, ctx.requestId);
  }

  @Get(":id")
  @RequirePermissions("turmas.visualizar")
  get(@Param("id", idPipe) id: string): Promise<CohortDetail> {
    return this.cohorts.get(id);
  }

  @Patch(":id")
  @RequirePermissions("turmas.editar")
  update(
    @Param("id", idPipe) id: string,
    @ZodBody(UpdateCohortRequestSchema) body: UpdateCohortRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<CohortView> {
    return this.cohorts.update(ctx.auth!, id, body, ctx.requestId);
  }

  @Post(":id/status")
  @RequirePermissions("turmas.alterar_situacao")
  @HttpCode(200)
  changeStatus(
    @Param("id", idPipe) id: string,
    @ZodBody(ChangeCohortStatusRequestSchema) body: ChangeCohortStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<CohortView> {
    return this.cohorts.changeStatus(ctx.auth!, id, body.to, ctx.requestId);
  }
}
