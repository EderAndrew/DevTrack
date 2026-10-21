import { Body, Controller, Get, Param, type PipeTransform, Post, Res } from "@nestjs/common";
import {
  CODE_RUN_MAX_SOURCE_BYTES,
  type CodeRun,
  type CreateCodeRunRequest,
  CreateCodeRunRequestSchema,
  type LatestCodeRun,
  utf8ByteLength,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { AppException } from "../../platform/http/errors";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { CodeRunsService } from "./code-runs.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The run's body (contracts/http-api.md): a program over 64 KB of UTF-8 is `413 SOURCE_TOO_LARGE`,
 * told apart from a malformed body (`400`, the strict contract schema) before anything is read.
 */
class CreateCodeRunBodyPipe implements PipeTransform<unknown, CreateCodeRunRequest> {
  private readonly strict = new ZodValidationPipe(CreateCodeRunRequestSchema);

  transform(value: unknown): CreateCodeRunRequest {
    const sourceCode = (value as { sourceCode?: unknown } | null)?.sourceCode;
    if (typeof sourceCode === "string" && utf8ByteLength(sourceCode) > CODE_RUN_MAX_SOURCE_BYTES) throw new AppException("SOURCE_TOO_LARGE");
    return this.strict.transform(value);
  }
}

/** The student's code runs (019 contracts/http-api.md, "Student: runs"); identity from the session only. */
@Controller("me")
export class CodeRunsController {
  constructor(private readonly runs: CodeRunsService) {}

  /** 202 for a new run; 200 with the student's pending run (of any question). */
  @Post("activities/:activityId/questions/:questionId/code-runs")
  @RequirePermissions("atividades.proprias.executar")
  async create(
    @Param("activityId", idPipe) activityId: string,
    @Param("questionId", idPipe) questionId: string,
    @Body(new CreateCodeRunBodyPipe()) body: CreateCodeRunRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CodeRun> {
    const { run, created } = await this.runs.create(ctx.auth!, activityId, questionId, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return run;
  }

  @Get("activities/:activityId/questions/:questionId/code-runs/latest")
  @RequirePermissions("atividades.proprias.executar")
  latest(@Param("activityId", idPipe) activityId: string, @Param("questionId", idPipe) questionId: string, @Ctx() ctx: RequestContext): Promise<LatestCodeRun> {
    return this.runs.latest(ctx.auth!.userId, activityId, questionId, ctx.requestId);
  }

  @Get("code-runs/:runId")
  @RequirePermissions("atividades.proprias.executar")
  get(@Param("runId", idPipe) runId: string, @Ctx() ctx: RequestContext): Promise<CodeRun> {
    return this.runs.get(ctx.auth!.userId, runId);
  }
}
