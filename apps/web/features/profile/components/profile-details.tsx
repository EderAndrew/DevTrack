import type { MeView } from "@repo/contracts";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/messages/status-labels";

export interface ProfileDetailsProps {
  me: Pick<MeView, "name" | "email" | "emailVerified" | "roles">;
}

/** Identity data of the signed-in user, read-only. */
export function ProfileDetails({ me }: ProfileDetailsProps) {
  const roles = me.roles.map((role) => `${ROLE_LABELS[role.key] ?? role.key} (${STATUS_LABELS[role.status]})`).join(", ");
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
      <dt className="font-semibold">Nome</dt>
      <dd className="m-0">{me.name}</dd>
      <dt className="font-semibold">E-mail</dt>
      <dd className="m-0">
        {me.email}
        {me.emailVerified ? null : <span className="text-muted-foreground"> (não confirmado)</span>}
      </dd>
      <dt className="font-semibold">Papéis</dt>
      <dd className="m-0">{roles || "Nenhum"}</dd>
    </dl>
  );
}
