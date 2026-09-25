import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Catalog } from "@/features/design-system/components/catalog";

export const metadata: Metadata = { title: "Design System", robots: { index: false } };

/**
 * The design system catalog (005 FR-031): every foundational component and layout with its
 * variants and states. Development and tests only; production answers 404 (research V14).
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <PageHeader
        title="Design System"
        description="Componentes fundamentais e layouts do DevTrack, com variantes e estados. Documentação em apps/web/design-system."
      />
      <Catalog />
    </>
  );
}
