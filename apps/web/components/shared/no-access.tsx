import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Shown when the user lacks the permission for an area (UX only; the API also refuses). */
export function NoAccess({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-160">
      <PageHeader title={title} />
      <Alert variant="info" className="mb-6" role="status">
        <AlertDescription>
          <p className="m-0">Você não tem acesso a esta área.</p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
