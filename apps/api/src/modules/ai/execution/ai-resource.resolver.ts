import { Inject, Injectable } from "@nestjs/common";
import type { AiResourceRef } from "@repo/contracts";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { Tx } from "../../../platform/database/transaction";
import { AppException, notFound } from "../../../platform/http/errors";
import { AI_DEFINITIONS, type AiDefinitions } from "../definitions/types";

/**
 * The resource of an execution belongs to the session teacher's workspace (006 FR-029, FR-032,
 * research A7), checked through the ownership rule of its type in `AI_DEFINITIONS.resources`.
 * The workspace always comes from the session, never from the request body.
 */
@Injectable()
export class AiResourceResolver {
  constructor(
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    private readonly prisma: PrismaService,
  ) {}

  /** Whether the agent accepts the type and the workspace owns the resource. */
  async owns(workspaceId: string, acceptedTypes: readonly string[], resource: AiResourceRef, db: Tx = this.prisma): Promise<"owned" | "type" | "missing"> {
    const ownership = this.definitions.resources[resource.type];
    if (!acceptedTypes.includes(resource.type) || !ownership) return "type";
    return (await ownership.ownedBy(db, workspaceId, resource.id)) ? "owned" : "missing";
  }

  /** Request time: unknown type for the agent → 422, not owned → 404 (never reveals existence). */
  async assertOwned(workspaceId: string, acceptedTypes: readonly string[], resource: AiResourceRef, db?: Tx): Promise<void> {
    const result = await this.owns(workspaceId, acceptedTypes, resource, db);
    if (result === "type") throw new AppException("AI_RESOURCE_TYPE_NOT_ACCEPTED");
    if (result === "missing") throw notFound();
  }
}
