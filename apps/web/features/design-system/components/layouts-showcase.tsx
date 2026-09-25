"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { StudentLayout } from "@/components/layout/student-layout";
import { SAMPLE_STUDENT, SAMPLE_TEACHER } from "./fixtures";
import { Sample, Showcase } from "./sample";
import { LayoutFrame, TabletFrame } from "./tablet-frame";

export function AppShellShowcase() {
  return (
    <Showcase id="app-shell">
      <Sample name="professor" className="block">
        <LayoutFrame label="AppShell do professor">
          <AppShell me={SAMPLE_TEACHER} defaultOpen preview>
            <PageHeader
              breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: "ADS3 — Noite" }]}
              title="ADS3 — Noite"
            />
            <p className="m-0">Conteúdo da página, até a largura máxima da área principal.</p>
          </AppShell>
        </LayoutFrame>
      </Sample>
    </Showcase>
  );
}

function StudentSample() {
  return (
    <StudentLayout me={SAMPLE_STUDENT} preview>
      <PageHeader title="Minhas turmas" />
      <p className="m-0">A atividade atual, o progresso e a próxima ação, sem elementos administrativos.</p>
    </StudentLayout>
  );
}

export function StudentLayoutShowcase() {
  return (
    <Showcase id="student-layout">
      <Sample name="aluno" className="block">
        <LayoutFrame label="Layout do aluno">
          <StudentSample />
        </LayoutFrame>
      </Sample>
      <Sample name="largura de tablet" className="block">
        <TabletFrame>
          <StudentSample />
        </TabletFrame>
      </Sample>
    </Showcase>
  );
}
