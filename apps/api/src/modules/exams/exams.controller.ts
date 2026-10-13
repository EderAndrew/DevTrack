import { Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  type CreateExamRequest,
  CreateExamRequestSchema,
  type ExamListQuery,
  ExamListQuerySchema,
  type ExamPage,
  type ExamStudentPreview,
  type ExamVersion,
  type ProgrammingLanguageList,
  ExamVersionSchema,
  type TeacherExam,
  type UpdateExamRequest,
  UpdateExamRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExamsService } from "./exams.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's own exams (018 contracts/http-api.md, "Banco de Provas"); other teachers' are 404. */
@Controller("exams")
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  /** A manual exam, DRAFT or APPROVED at the teacher's choice; origin MANUAL, no AI (US1). */
  @Post()
  @RequirePermissions("provas.criar")
  create(@ZodBody(CreateExamRequestSchema) body: CreateExamRequest, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.create(ctx.auth!, body, ctx.requestId);
  }

  /** The teacher's bank: status, subject, title search, keyset pages; ARCHIVED only when asked. */
  @Get()
  @RequirePermissions("provas.visualizar")
  list(@Query(new ZodValidationPipe(ExamListQuerySchema)) query: ExamListQuery, @Ctx() ctx: RequestContext): Promise<ExamPage> {
    return this.exams.list(ctx.auth!.userId, query);
  }

  /** The active languages of the shared catalog (as 011 research W18); declared before `:id`. */
  @Get("programming-languages")
  @RequirePermissions("provas.visualizar")
  programmingLanguages(): Promise<ProgrammingLanguageList> {
    return this.exams.programmingLanguages();
  }

  @Get(":id")
  @RequirePermissions("provas.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.getForTeacher(ctx.auth!.userId, id);
  }

  /** "Ver como aluno": what a student will see of this exam, with no answer key. */
  @Get(":id/student-preview")
  @RequirePermissions("provas.visualizar")
  studentPreview(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ExamStudentPreview> {
    return this.exams.studentPreview(ctx.auth!.userId, id);
  }

  /** The whole exam again, with the version it was read at. */
  @Put(":id")
  @RequirePermissions("provas.editar")
  update(@Param("id", idPipe) id: string, @ZodBody(UpdateExamRequestSchema) body: UpdateExamRequest, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.update(ctx.auth!, id, body, ctx.requestId);
  }

  /** DRAFT → APPROVED by a person; already APPROVED → 200 with no event. */
  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermissions("provas.aprovar")
  approve(@Param("id", idPipe) id: string, @ZodBody(ExamVersionSchema) body: ExamVersion, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.approve(ctx.auth!, id, body, ctx.requestId);
  }

  /** DRAFT or APPROVED → ARCHIVED; already ARCHIVED → 200 with no event. */
  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermissions("provas.arquivar")
  archive(@Param("id", idPipe) id: string, @ZodBody(ExamVersionSchema) body: ExamVersion, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.archive(ctx.auth!, id, body, ctx.requestId);
  }

  /** ARCHIVED → the status it had before. */
  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermissions("provas.arquivar")
  restore(@Param("id", idPipe) id: string, @ZodBody(ExamVersionSchema) body: ExamVersion, @Ctx() ctx: RequestContext): Promise<TeacherExam> {
    return this.exams.restore(ctx.auth!, id, body, ctx.requestId);
  }
}
