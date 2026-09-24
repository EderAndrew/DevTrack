"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SyllabusSection } from "@/features/syllabus/components/syllabus-section";
import { messageForError } from "@/lib/messages/error-messages";
import { useClass } from "../hooks/use-classes";
import { ClassInvitationsTab } from "./class-invitations-tab";
import { ClassOfferingRequired } from "./class-offering-required";
import { ClassStudentsTab } from "./class-students-tab";

/**
 * The body of each section of a class page. The class itself comes from the cache filled by the
 * page header (`ClassDetails`), so the actions follow its status: nothing is removed from an
 * archived class and invitations are resent only while it is active.
 */
function useLoadedClass(classId: string) {
  const query = useClass(classId);
  const fallback = query.isPending ? (
    <div aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <Skeleton className="h-24 w-full" />
    </div>
  ) : query.isError ? (
    <div role="alert">
      <p>{messageForError(query.error)}</p>
      <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
        Tentar novamente
      </Button>
    </div>
  ) : null;
  return { schoolClass: query.data, fallback };
}

export function ClassStudentsSection({ classId, canRemove }: { classId: string; canRemove: boolean }) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  return <ClassStudentsTab classId={classId} canRemove={canRemove && schoolClass.status !== "ARCHIVED"} />;
}

export interface ClassInvitationsSectionProps {
  classId: string;
  canResend: boolean;
  canCancel: boolean;
}

export function ClassInvitationsSection({ classId, canResend, canCancel }: ClassInvitationsSectionProps) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  return (
    <ClassInvitationsTab classId={classId} canResend={canResend && schoolClass.status === "ACTIVE"} canCancel={canCancel} />
  );
}

export interface ClassPlanningSectionProps {
  classId: string;
  /** Section heading: Ementa, Calendário or Planejamento. */
  title: string;
  /** What the section shows once the class is plannable, until its story fills it. */
  empty: string;
  canEditClass: boolean;
}

/** Ementa, Calendário and Planejamento: `ClassOfferingRequired` until the class is plannable. */
export function ClassPlanningSection({ classId, title, empty, canEditClass }: ClassPlanningSectionProps) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  return (
    <section aria-labelledby="secao-titulo">
      <h2 id="secao-titulo">{title}</h2>
      {schoolClass.plannable ? (
        <p>{empty}</p>
      ) : (
        <ClassOfferingRequired classId={classId} canEdit={canEditClass && schoolClass.status !== "ARCHIVED"} />
      )}
    </section>
  );
}

export interface ClassSyllabusSectionProps {
  classId: string;
  canEditClass: boolean;
  /** UX only (`ementas.enviar`): "Enviar ementa", which sends to the class's subject. */
  canUpload: boolean;
}

/**
 * Ementa of a class (004/US2, FR-006): the versions of its subject's syllabus and "Enviar
 * ementa", sent through the subject; version links carry `?turma=` to come back here.
 */
export function ClassSyllabusSection({ classId, canEditClass, canUpload }: ClassSyllabusSectionProps) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  if (!schoolClass.plannable || !schoolClass.subject) {
    return (
      <section aria-labelledby="secao-titulo">
        <h2 id="secao-titulo">Ementa</h2>
        <ClassOfferingRequired classId={classId} canEdit={canEditClass && schoolClass.status !== "ARCHIVED"} />
      </section>
    );
  }
  return (
    <SyllabusSection
      subjectId={schoolClass.subject.id}
      classId={classId}
      canUpload={canUpload && schoolClass.status !== "ARCHIVED"}
    />
  );
}
