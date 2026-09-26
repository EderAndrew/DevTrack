import { Injectable, Logger } from "@nestjs/common";
import type {
  CurriculumAiAvailability,
  CurriculumAiStatus,
  RequestCurriculumAnalysisRequest,
  RequestCurriculumAnalysisResponse,
} from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { AiProposalsService } from "../ai/proposals/ai-proposals.service";
import { CURRICULUM_AGENT_KEY, CURRICULUM_PROPOSAL_TYPE } from "./definitions/curriculum-agent";
import { derivedUuid } from "./proposal/derived-uuid";

const ACTIVE = new Set(["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"]);

const resourceOf = (documentId: string) => ({ type: "SYLLABUS_DOCUMENT", id: documentId });

/**
 * "Preencher com IA" on a syllabus document (007 US1, research C13, C14). The document is always
 * looked up within the session teacher's subjects (404 otherwise); the execution itself goes
 * through the AI foundation, which re-checks the agent, the permission, the resource and the model.
 * Logs carry only ids and counts (research C19).
 */
@Injectable()
export class CurriculumAiRequestService {
  private readonly logger = new Logger("CurriculumAi");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly executions: AiExecutionsService,
    private readonly proposals: AiProposalsService,
  ) {}

  async status(auth: AuthContext, documentId: string): Promise<CurriculumAiStatus> {
    const workspaceId = auth.userId;
    const document = await this.findDocument(workspaceId, documentId);
    const resource = resourceOf(documentId);
    const [availability, lastExecution, pendingProposalId] = await Promise.all([
      this.availabilityOf(document),
      this.executions.findLatestForResource(workspaceId, CURRICULUM_AGENT_KEY, resource),
      this.proposals.findPendingForTarget(workspaceId, CURRICULUM_PROPOSAL_TYPE, resource),
    ]);
    const active = lastExecution !== null && ACTIVE.has(lastExecution.status);
    return {
      availability,
      activeExecution: active ? lastExecution : null,
      lastExecution,
      lastOutcome: lastExecution?.status === "COMPLETED" ? (lastExecution.proposalId ? "PROPOSAL" : "NOTHING_FOUND") : null,
      pendingProposalId,
    };
  }

  /**
   * One active analysis per document (FR-014): an active execution is returned as is; otherwise the
   * idempotency key is derived from the count of this teacher's executions on the document, so
   * concurrent first requests share it and the foundation's unique index lets one win.
   */
  async request(
    auth: AuthContext,
    documentId: string,
    _body: RequestCurriculumAnalysisRequest,
    requestId: string | null,
  ): Promise<RequestCurriculumAnalysisResponse> {
    const workspaceId = auth.userId;
    const document = await this.findDocument(workspaceId, documentId);
    if (document.processingStatus !== "PROCESSED" || document.extractionResult !== "TEXT") {
      throw new AppException("SYLLABUS_NOT_READY_FOR_AI");
    }
    const resource = resourceOf(documentId);

    const latest = await this.executions.findLatestForResource(workspaceId, CURRICULUM_AGENT_KEY, resource);
    if (latest && ACTIVE.has(latest.status)) return this.replayed(auth, documentId, latest, requestId);

    const n = await this.executions.countForResource(workspaceId, CURRICULUM_AGENT_KEY, resource);
    const { view, created } = await this.executions
      .request(
        auth,
        { agentKey: CURRICULUM_AGENT_KEY, resource, input: {}, idempotencyKey: derivedUuid(`curriculum-ai:${documentId}:${n}`) },
        requestId,
        { onCreated: (tx, executionId) => this.recordRequested(tx, auth, documentId, executionId, true, requestId) },
      )
      .catch((error: unknown) => {
        // On this route 404 means only "document outside your subjects": an agent that isn't
        // registered is as unavailable as a disabled one (availability says AGENT_DISABLED too).
        if (error instanceof AppException && error.code === "AI_AGENT_NOT_FOUND") throw new AppException("AI_AGENT_DISABLED");
        throw error;
      });
    if (!created) return this.replayed(auth, documentId, view, requestId);

    this.logger.log({ documentId, executionId: view.id }, "curriculum_ai.analysis_requested");
    return { execution: view, created: true };
  }

  /** A repeated request changes no state: only its audit row is written (`created: false`). */
  private async replayed(
    auth: AuthContext,
    documentId: string,
    execution: RequestCurriculumAnalysisResponse["execution"],
    requestId: string | null,
  ): Promise<RequestCurriculumAnalysisResponse> {
    await this.recordRequested(this.prisma, auth, documentId, execution.id, false, requestId);
    return { execution, created: false };
  }

  private recordRequested(
    db: Parameters<AuditService["record"]>[0],
    auth: AuthContext,
    documentId: string,
    executionId: string,
    created: boolean,
    requestId: string | null,
  ): Promise<void> {
    return this.audit.record(db, {
      type: "curriculum_ai.analysis_requested",
      actorType: "USER",
      actorUserId: auth.userId,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: documentId,
      requestId,
      metadata: { executionId, created, discardedProposal: false },
    });
  }

  /** The document's reasons first, then the foundation's (research C14). */
  private async availabilityOf(document: DocumentState): Promise<CurriculumAiAvailability> {
    if (document.processingStatus !== "PROCESSED") return "DOCUMENT_NOT_READY";
    if (document.extractionResult !== "TEXT") return "DOCUMENT_WITHOUT_TEXT";
    return this.executions.availability(CURRICULUM_AGENT_KEY);
  }

  private async findDocument(teacherId: string, documentId: string): Promise<DocumentState> {
    const document = await this.prisma.syllabusDocument.findFirst({
      where: { id: documentId, subject: { teacherId } },
      select: { id: true, processingStatus: true, extractionResult: true },
    });
    if (!document) throw notFound();
    return document;
  }
}

type DocumentState = { id: string; processingStatus: string; extractionResult: string | null };
