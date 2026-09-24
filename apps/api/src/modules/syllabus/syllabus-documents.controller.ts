import { Controller, Get, HttpCode, Param, Post, Query, Res, StreamableFile, UseInterceptors } from "@nestjs/common";
import {
  EmptyBodySchema,
  type SyllabusDocumentDetail,
  type SyllabusDocumentList,
  type SyllabusDocumentView,
  type SyllabusFileQuery,
  SyllabusFileQuerySchema,
  type SyllabusUploadResult,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { AcceptsMultipart } from "../../platform/http/origin.guard";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { SyllabusFile, SyllabusFileInterceptor, type UploadedSyllabusFile } from "../../platform/http/upload";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { SyllabusDocumentsService } from "./syllabus-documents.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * `Content-Disposition` of RFC 6266: an ASCII fallback plus the UTF-8 name (`filename*`), so no
 * character of the teacher's file name can break out of the header.
 */
export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Syllabus documents of a teacher's subject (004 contracts/http-api.md, "Ementa: documentos"). No delete (FR-013). */
@Controller()
export class SyllabusDocumentsController {
  constructor(private readonly documents: SyllabusDocumentsService) {}

  @Get("subjects/:id/syllabus-documents")
  @RequirePermissions("ementas.visualizar")
  list(@Param("id", idPipe) subjectId: string, @Ctx() ctx: RequestContext): Promise<SyllabusDocumentList> {
    return this.documents.list(ctx.auth!.userId, subjectId);
  }

  /** 201 with a new version, or 200 with the existing one when the same file was sent again (FR-011). */
  @Post("subjects/:id/syllabus-documents")
  @RequirePermissions("ementas.enviar")
  @AcceptsMultipart()
  @UseInterceptors(SyllabusFileInterceptor)
  async upload(
    @Param("id", idPipe) subjectId: string,
    @SyllabusFile() file: UploadedSyllabusFile,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SyllabusUploadResult> {
    const result = await this.documents.upload(ctx.auth!, subjectId, file, ctx.requestId);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Get("syllabus-documents/:id")
  @RequirePermissions("ementas.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<SyllabusDocumentDetail> {
    return this.documents.getDetail(ctx.auth!.userId, id);
  }

  /** The original bytes (E18): never cached, sandboxed, inline only for images. */
  @Get("syllabus-documents/:id/file")
  @RequirePermissions("ementas.visualizar")
  async download(
    @Param("id", idPipe) id: string,
    @Query(new ZodValidationPipe(SyllabusFileQuerySchema)) query: SyllabusFileQuery,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.documents.download(ctx.auth!.userId, id, query.view === "inline");
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": contentDisposition(file.inline ? "inline" : "attachment", file.filename),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    return new StreamableFile(file.bytes);
  }

  @Post("syllabus-documents/:id/retry")
  @RequirePermissions("ementas.enviar")
  @HttpCode(202)
  retry(
    @Param("id", idPipe) id: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<SyllabusDocumentView> {
    return this.documents.retry(ctx.auth!, id);
  }
}
