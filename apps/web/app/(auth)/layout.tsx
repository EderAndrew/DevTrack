/** Login, password recovery and invitation acceptance: screens with no site header. */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="conteudo" tabIndex={-1}>
      {children}
    </main>
  );
}
