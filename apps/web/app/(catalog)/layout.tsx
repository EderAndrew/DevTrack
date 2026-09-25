/** Frame of the design system catalog: no menu and no session, only the content (005 research V14). */
export default function CatalogLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-8">
      {children}
    </main>
  );
}
