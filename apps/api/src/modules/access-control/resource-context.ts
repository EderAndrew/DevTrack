import { notFound } from "../../platform/http/errors";
import type { Tx } from "../../platform/database/transaction";

/**
 * Resource-context authorization (FR-062, R9). Guards answer "may this user do X at all?"
 * (→ 403); a policy answers "is this particular resource inside the user's context?" and
 * its absence is indistinguishable from non-existence (→ 404).
 *
 * Contract for implementations (003: `ClassContextPolicy`; later specs: assessments…):
 * - load the resource with a query already scoped to the principal (e.g. `WHERE id = $1
 *   AND owner_id = $2`), never "load then compare", so an out-of-context resource is simply
 *   not found;
 * - return `null` when it is out of context or does not exist — callers then go through
 *   `findOwnedOrNotFound`, which turns both into the same `404 NOT_FOUND`;
 * - carry no role-name checks: capability checks belong to `@RequirePermissions()`.
 *
 * Spec 001 has no implementation of this interface: its only scoped resource (own sessions)
 * uses `findOwnedOrNotFound` directly. 003 adds `ClassContextPolicy` (classes/class-context.policy.ts).
 */
export interface ResourceContextPolicy<TResource, TId = string> {
  findInContext(userId: string, resourceId: TId, db?: Tx): Promise<TResource | null>;
}

/** Runs a scoped lookup and maps "absent or outside the context" to `404 NOT_FOUND`. */
export async function findOwnedOrNotFound<T>(lookup: () => Promise<T | null | undefined>): Promise<T> {
  const resource = await lookup();
  if (resource === null || resource === undefined) throw notFound();
  return resource;
}
