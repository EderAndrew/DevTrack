/**
 * The public address of the site, for the search engines (robots.txt, sitemap.xml, canonical URLs and
 * Open Graph). `SITE_ORIGIN` overrides it; without it, the beta's domain.
 */
export const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://devtrack.nativcode.com.br").replace(/\/+$/, "");

/** The only pages a search engine may index: the login screen, which is also the home ("/" redirects to it). */
export const INDEXABLE_PATHS = ["/entrar"] as const;

export const SITE_DESCRIPTION =
  "DevTrack: plataforma de ensino e avaliação de programação configurável por professor, com trabalhos, provas e exercícios por turma.";

/**
 * Never crawled: the API, the signed-in areas and the pages that carry a token in the address (an
 * invitation, a password reset, an e-mail check, the admin activation). Every page but `INDEXABLE_PATHS`
 * also answers `noindex` (root layout).
 */
export const DISALLOWED_PATHS = [
  "/api/",
  "/convite",
  "/convite-turma",
  "/redefinir-senha",
  "/verificar-email",
  "/ativar-admin",
  "/conta/",
  "/admin/",
  "/professores/",
  "/turmas/",
  "/gestao/",
  "/disciplinas/",
  "/exercicios/",
  "/trabalhos/",
  "/provas/",
  "/minhas-turmas/",
  "/minhas-atividades/",
  "/painel",
  "/historico",
  "/meus-feedbacks",
] as const;
