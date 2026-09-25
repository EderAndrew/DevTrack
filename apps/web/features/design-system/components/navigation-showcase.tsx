"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Topbar } from "@/components/layout/topbar";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SAMPLE_ADMIN, SAMPLE_TEACHER } from "./fixtures";
import { Sample, Showcase } from "./sample";
import { LayoutFrame, TabletFrame } from "./tablet-frame";

export function SidebarShowcase() {
  return (
    <Showcase id="sidebar">
      <Sample name="expandido" className="block">
        <LayoutFrame label="Menu lateral expandido">
          <SidebarProvider defaultOpen className="min-h-0">
            <AppSidebar me={SAMPLE_ADMIN} />
          </SidebarProvider>
        </LayoutFrame>
      </Sample>
      <Sample name="recolhido" className="block">
        <LayoutFrame label="Menu lateral recolhido">
          <SidebarProvider defaultOpen={false} className="min-h-0">
            <AppSidebar me={SAMPLE_TEACHER} />
          </SidebarProvider>
        </LayoutFrame>
      </Sample>
    </Showcase>
  );
}

export function TopbarShowcase() {
  return (
    <Showcase id="topbar">
      <Sample name="padrão" className="block">
        <SidebarProvider className="min-h-0">
          <SidebarInset>
            <Topbar />
          </SidebarInset>
        </SidebarProvider>
      </Sample>
    </Showcase>
  );
}

export function BreadcrumbShowcase() {
  return (
    <Showcase id="breadcrumb">
      <Sample name="dois níveis">
        <Breadcrumb items={[{ label: "Turmas", href: "/turmas" }, { label: "Nova turma" }]} />
      </Sample>
      <Sample name="três níveis">
        <Breadcrumb
          items={[
            { label: "Minhas disciplinas", href: "/disciplinas" },
            { label: "Programação Orientada a Objetos", href: "/disciplinas" },
            { label: "Ementa 2026" },
          ]}
        />
      </Sample>
    </Showcase>
  );
}

function FullHeader() {
  return (
    <PageHeader
      breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: "ADS3 — Noite" }]}
      title="ADS3 — Noite"
      status={<Badge variant="success">Ativa</Badge>}
      description="Programação Orientada a Objetos · 2026.2"
      actions={
        <>
          <Button type="button" variant="outline">
            Editar
          </Button>
          <Button type="button">
            <Plus aria-hidden="true" />
            Convidar alunos
          </Button>
        </>
      }
    />
  );
}

export function PageHeaderShowcase() {
  return (
    <Showcase id="page-header">
      <Sample name="só título" className="block">
        <PageHeader title="Turmas" />
      </Sample>
      <Sample name="completo" className="block">
        <FullHeader />
      </Sample>
      <Sample name="largura de tablet" className="block">
        <TabletFrame>
          <FullHeader />
        </TabletFrame>
      </Sample>
    </Showcase>
  );
}
