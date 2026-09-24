"use client";

import type { ReactNode } from "react";
import { SyllabusUpload } from "./syllabus-upload";
import { SyllabusVersionsList } from "./syllabus-versions-list";

export interface SyllabusSectionProps {
  subjectId: string;
  /** UX only (`ementas.enviar` and an active subject): "Enviar ementa". */
  canUpload: boolean;
  /** On a class page: links keep `?turma=` to come back (FR-006). */
  classId?: string;
  /** Shown under the heading, before the versions (the class page's "Ementa usada pela turma"). */
  children?: ReactNode;
}

/** "Ementa" of a subject or of a class's subject: the versions and "Enviar ementa" (004/US2). */
export function SyllabusSection({ subjectId, canUpload, classId, children }: SyllabusSectionProps) {
  return (
    <section aria-labelledby="ementa-titulo" className="mt-8">
      <h2 id="ementa-titulo">Ementa</h2>
      {children}
      <SyllabusVersionsList subjectId={subjectId} classId={classId} />
      {canUpload ? (
        <div className="mt-4">
          <h3 className="mt-0">Enviar ementa</h3>
          <SyllabusUpload subjectId={subjectId} />
        </div>
      ) : null}
    </section>
  );
}
