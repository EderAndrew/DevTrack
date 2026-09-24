import { Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  type CreateSyllabusRevisionRequest,
  CreateSyllabusRevisionRequestSchema,
  EmptyBodySchema,
  type SaveSyllabusRevisionRequest,
  SaveSyllabusRevisionRequestSchema,
  type SyllabusRevisionView,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { SyllabusRevisionsService } from "./syllabus-revisions.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** Reviewed content of a syllabus document (004 contracts/http-api.md, "Ementa: revisões"). No delete (FR-013). */
@Controller()
export class SyllabusRevisionsController {
  constructor(private readonly revisions: SyllabusRevisionsService) {}

  /** A new DRAFT: from the extraction, empty ("Preencher manualmente") or copied from a confirmed revision. */
  @Post("syllabus-documents/:id/revisions")
  @RequirePermissions("ementas.revisar")
  create(
    @Param("id", idPipe) documentId: string,
    @ZodBody(CreateSyllabusRevisionRequestSchema) body: CreateSyllabusRevisionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<SyllabusRevisionView> {
    return this.revisions.create(ctx.auth!, documentId, body);
  }

  @Get("syllabus-revisions/:id")
  @RequirePermissions("ementas.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<SyllabusRevisionView> {
    return this.revisions.get(ctx.auth!.userId, id);
  }

  @Put("syllabus-revisions/:id")
  @RequirePermissions("ementas.revisar")
  save(
    @Param("id", idPipe) id: string,
    @ZodBody(SaveSyllabusRevisionRequestSchema) body: SaveSyllabusRevisionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<SyllabusRevisionView> {
    return this.revisions.save(ctx.auth!, id, body);
  }

  /** Confirming again is a no-op answered with 200. */
  @Post("syllabus-revisions/:id/confirm")
  @RequirePermissions("ementas.revisar")
  @HttpCode(200)
  confirm(
    @Param("id", idPipe) id: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<SyllabusRevisionView> {
    return this.revisions.confirm(ctx.auth!, id, ctx.requestId);
  }
}
