import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Shown when the user lacks the permission for an area (UX only; the API also refuses). */
export function NoAccess({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <h1>{title}</h1>
      <Alert className="mb-6" role="status">
        <Info aria-hidden="true" />
        <AlertDescription>
          <p className="m-0">Você não tem acesso a esta área.</p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
