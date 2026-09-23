"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClass } from "../hooks/use-classes";
import { ClassInvitationsTab } from "./class-invitations-tab";
import { ClassStatusActions } from "./class-status-actions";
import { ClassStatusBadge } from "./class-status-badge";
import { InviteStudentDialog } from "./invite-student-dialog";

const TABS = [
  { id: "alunos", label: "Alunos" },
  { id: "convites", label: "Convites" },
] as const;

export interface ClassDetailsProps {
  id: string;
  /** UX only (the API authorizes): which actions to offer. */
  canEdit: boolean;
  canChangeStatus: boolean;
  /** "Convidar aluno", offered only while the class is ACTIVE (FR-010). */
  canInvite: boolean;
  /** Actions on pending invitations in the "Convites" tab (FR-020, FR-022). */
  canResendInvitation?: boolean;
  canCancelInvitation?: boolean;
}

/**
 * Class page (FR-008): data, status, number of active students and the actions ("Convidar
 * aluno", Editar, status changes), then the "Alunos" and "Convites" tabs (filled by the
 * following stories).
 */
export function ClassDetails({
  id,
  canEdit,
  canChangeStatus,
  canInvite,
  canResendInvitation = false,
  canCancelInvitation = false,
}: ClassDetailsProps) {
  const query = useClass(id);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando turma…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert">
        <p>{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const schoolClass = query.data;
  const archived = schoolClass.status === "ARCHIVED";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0">{schoolClass.name}</h1>
        <ClassStatusBadge status={schoolClass.status} />
      </div>
      <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Código</dt>
        <dd className="m-0">{schoolClass.code}</dd>
        <dt className="font-semibold">Ano letivo</dt>
        <dd className="m-0">{schoolClass.academicYear}</dd>
        <dt className="font-semibold">Período</dt>
        <dd className="m-0">{schoolClass.period ?? "Não informado"}</dd>
        <dt className="font-semibold">Alunos ativos</dt>
        <dd className="m-0">{schoolClass.activeStudentCount}</dd>
        <dt className="font-semibold">Descrição</dt>
        <dd className="m-0 whitespace-pre-line">{schoolClass.description ?? "Sem descrição"}</dd>
      </dl>

      <div className="mb-6 flex flex-wrap items-start gap-2">
        {canInvite && schoolClass.status === "ACTIVE" ? <InviteStudentDialog classId={schoolClass.id} /> : null}
        {canEdit && !archived ? (
          <Button asChild variant="secondary">
            <Link href={`/turmas/${schoolClass.id}/editar`}>
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          </Button>
        ) : null}
        {canChangeStatus ? <ClassStatusActions schoolClass={schoolClass} /> : null}
      </div>

      <ClassTabs
        panels={{
          alunos: <p>Nenhum aluno nesta turma.</p>,
          convites: (
            <ClassInvitationsTab
              classId={schoolClass.id}
              canResend={canResendInvitation && schoolClass.status === "ACTIVE"}
              canCancel={canCancelInvitation}
            />
          ),
        }}
      />
    </div>
  );
}

/** WAI-ARIA tabs: arrows, Home and End move between tabs; only the selected one is in the Tab order. */
function ClassTabs({ panels }: { panels: Record<(typeof TABS)[number]["id"], ReactNode> }) {
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = (index + TABS.length) % TABS.length;
    setSelected(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: TABS.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div>
      <div role="tablist" aria-label="Turma" className="mb-4 flex gap-2 border-b border-border">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`aba-${tab.id}`}
            aria-selected={selected === index}
            aria-controls={`painel-${tab.id}`}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={onKeyDown}
            className="min-h-11 border-b-2 border-transparent px-3 aria-selected:border-primary aria-selected:font-semibold"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`painel-${tab.id}`}
          aria-labelledby={`aba-${tab.id}`}
          hidden={selected !== index}
          tabIndex={0}
        >
          {selected === index ? panels[tab.id] : null}
        </div>
      ))}
    </div>
  );
}
