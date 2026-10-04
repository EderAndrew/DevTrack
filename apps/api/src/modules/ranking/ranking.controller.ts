import { Controller, Get, Param } from "@nestjs/common";
import { type ClassRanking, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { RankingService } from "./ranking.service";

/** The student's "Ranking" of one class (013 contracts/http-api.md); identity from the session only. */
@Controller("me/classes")
export class MyRankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get(":classId/ranking")
  @RequirePermissions("ranking.turma.visualizar")
  get(@Param("classId", new ZodValidationPipe(UuidSchema)) classId: string, @Ctx() ctx: RequestContext): Promise<ClassRanking> {
    return this.ranking.forStudent(ctx.auth!.userId, classId);
  }
}

/** The teacher's ranking of one of their classes (013/FR-022); `ClassContextPolicy` scopes it → 404. */
@Controller("classes")
export class ClassRankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get(":classId/ranking")
  @RequirePermissions("ranking.visualizar")
  get(@Param("classId", new ZodValidationPipe(UuidSchema)) classId: string, @Ctx() ctx: RequestContext): Promise<ClassRanking> {
    return this.ranking.forTeacher(ctx.auth!.userId, classId);
  }
}
