import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type AiProposalListQuery,
  AiProposalListQuerySchema,
  type AiProposalPage,
  type AiProposalView,
  type DecideAiProposalRequest,
  DecideAiProposalRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../../access-control/decorators";
import { AiProposalsService } from "./ai-proposals.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The session teacher's proposals (006 contracts/http-api.md); other teachers' are 404. */
@Controller("ai/proposals")
export class AiProposalsController {
  constructor(private readonly proposals: AiProposalsService) {}

  @Get()
  @RequirePermissions("ia.propostas.revisar")
  list(@Query(new ZodValidationPipe(AiProposalListQuerySchema)) query: AiProposalListQuery, @Ctx() ctx: RequestContext): Promise<AiProposalPage> {
    return this.proposals.list(ctx.auth!.userId, query);
  }

  @Get(":id")
  @RequirePermissions("ia.propostas.revisar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<AiProposalView> {
    return this.proposals.get(ctx.auth!.userId, id);
  }

  @Post(":id/decision")
  @RequirePermissions("ia.propostas.revisar")
  @HttpCode(200)
  decide(
    @Param("id", idPipe) id: string,
    @ZodBody(DecideAiProposalRequestSchema) body: DecideAiProposalRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<AiProposalView> {
    return this.proposals.decide(ctx.auth!, id, body, ctx.requestId);
  }
}
