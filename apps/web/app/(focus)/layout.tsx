/**
 * The controlled mode's frame (015 research F14, exam-mode.md "Só o necessário para responder"): no
 * side menu, topbar or link to another area; the page brings its own header with "Sair".
 */
export default function FocusLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="conteudo" tabIndex={-1} className="mx-auto w-full flex-1 px-(--gutter) py-6">
      {children}
    </main>
  );
}
