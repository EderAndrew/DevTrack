import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/api/server", () => ({ getMeForNavigation: async () => null }));
vi.mock("@/features/auth/components/login-screen", () => ({ LoginScreen: () => null }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "fonte" }) }));
vi.mock("./providers", () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./globals.css", () => ({}));

const { default: robots } = await import("./robots");
const { default: sitemap } = await import("./sitemap");
const { metadata: rootMetadata } = await import("./layout");
const { metadata: loginMetadata } = await import("./(auth)/entrar/page");

const ORIGIN = "https://devtrack.nativcode.com.br";

describe("busca: robots.txt, sitemap.xml e indexação", () => {
  it("robots.txt libera o público, bloqueia a API, as áreas com login e as páginas com token, e aponta o sitemap", () => {
    const { rules, sitemap: sitemapUrl } = robots();
    const rule = Array.isArray(rules) ? rules[0]! : rules;
    expect(rule.allow).toBe("/");
    for (const path of ["/api/", "/convite", "/convite-turma", "/redefinir-senha", "/verificar-email", "/ativar-admin", "/turmas/", "/painel"]) {
      expect(rule.disallow, path).toContain(path);
    }
    expect(rule.disallow).not.toContain("/entrar");
    expect(sitemapUrl).toBe(`${ORIGIN}/sitemap.xml`);
  });

  it("sitemap.xml lista só a página de entrada, com o endereço completo", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([`${ORIGIN}/entrar`]);
  });

  it("toda página é noindex por padrão; só /entrar é indexável, com descrição e endereço canônico", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe(`${ORIGIN}/`);
    expect(rootMetadata.robots).toEqual({ index: false, follow: false });
    expect(loginMetadata.robots).toEqual({ index: true, follow: false });
    expect(loginMetadata.alternates).toEqual({ canonical: "/entrar" });
    expect(loginMetadata.description).toMatch(/^DevTrack: plataforma de ensino e avaliação/);
  });
});
