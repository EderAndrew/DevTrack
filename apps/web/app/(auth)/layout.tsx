/** Login and password recovery: screens with their own branding and no site header. */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="conteudo" tabIndex={-1}>
      {children}
    </main>
  );
}
