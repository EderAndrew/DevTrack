/** Shown when the user lacks the permission for an area (UX only; the API also refuses). */
export function NoAccess({ title }: { title: string }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <div className="notice" role="status">
        <p>Você não tem acesso a esta área.</p>
      </div>
    </section>
  );
}
