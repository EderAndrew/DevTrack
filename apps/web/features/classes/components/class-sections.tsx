"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingCalendar } from "@/features/class-calendar/components/meeting-calendar";
import { ClassPlanPage } from "@/features/class-plan/components/class-plan-view";
import { PlanSyllabusPicker } from "@/features/class-plan/components/plan-syllabus-picker";
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

export interface ClassPlanSectionProps {
  classId: string;
  canEditClass: boolean;
  /** UX only (`planejamento.editar`): creating topics; the API decides. */
  canEdit: boolean;
}

/**
 * Planejamento of a class (004/US5): its class days with topics, "Sem data" and the coverage.
 * Read-only without `planejamento.editar` or once the class is archived.
 */
export function ClassPlanSection({ classId, canEditClass, canEdit }: ClassPlanSectionProps) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  const archived = schoolClass.status === "ARCHIVED";
  return (
    <section aria-labelledby="secao-titulo">
      <h2 id="secao-titulo">Planejamento</h2>
      {/* `plannable` is false once archived, but an archived class still shows its plan. */}
      {schoolClass.subject && schoolClass.startsOn && schoolClass.endsOn ? (
        <ClassPlanPage classId={classId} canEdit={canEdit && !archived} />
      ) : (
        <ClassOfferingRequired classId={classId} canEdit={canEditClass && !archived} />
      )}
    </section>
  );
}

export interface ClassCalendarSectionProps {
  classId: string;
  canEditClass: boolean;
  /** UX only (`calendario.gerenciar`): marking and unmarking days; the API decides. */
  canManage: boolean;
}

/**
 * Calendário of a class (004/US4): the days of its period with a class. Read-only without
 * `calendario.gerenciar` or once the class is archived.
 */
export function ClassCalendarSection({ classId, canEditClass, canManage }: ClassCalendarSectionProps) {
  const { schoolClass, fallback } = useLoadedClass(classId);
  if (!schoolClass) return fallback;
  const archived = schoolClass.status === "ARCHIVED";
  return (
    <section aria-labelledby="secao-titulo">
      <h2 id="secao-titulo">Calendário</h2>
      {/* `plannable` is false once archived, but an archived class still shows its days. */}
      {schoolClass.subject && schoolClass.startsOn && schoolClass.endsOn ? (
        <MeetingCalendar
          classId={classId}
          startsOn={schoolClass.startsOn}
          endsOn={schoolClass.endsOn}
          canEdit={canManage && !archived}
        />
      ) : (
        <ClassOfferingRequired classId={classId} canEdit={canEditClass && !archived} />
      )}
    </section>
  );
}

export interface ClassSyllabusSectionProps {
  classId: string;
  canEditClass: boolean;
  /** UX only (`ementas.enviar`): "Enviar ementa", which sends to the class's subject. */
  canUpload: boolean;
  /** UX only (`planejamento.editar`): choosing the confirmed version the class uses. */
  canSelect: boolean;
}

/**
 * Ementa of a class (004/US2, US5, FR-006): the version its plan uses and the choice among the
 * confirmed ones, the versions of its subject's syllabus and "Enviar ementa", sent through the
 * subject; version links carry `?turma=` to come back here.
 */
export function ClassSyllabusSection({ classId, canEditClass, canUpload, canSelect }: ClassSyllabusSectionProps) {
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
    >
      <PlanSyllabusPicker
        classId={classId}
        subjectId={schoolClass.subject.id}
        canEdit={canSelect && schoolClass.status !== "ARCHIVED"}
      />
    </SyllabusSection>
  );
}
