import { type NextRequest, NextResponse } from "next/server";

/** Kept in sync with the API's cookie name (`__Host-devtrack_session`, R5). */
const SESSION_COOKIE_NAME = "__Host-devtrack_session";

/**
 * UX only: sends visitors without a session cookie straight to the login page. Whether the
 * cookie is still valid is decided by the API on every request; nothing here authorizes.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();
  const login = new URL("/entrar", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/conta/:path*",
    "/admin/:path*",
    "/professores/:path*",
    "/turmas/:path*",
    "/disciplinas/:path*",
    "/exercicios/:path*",
    "/trabalhos/:path*",
    "/provas/:path*",
    "/minhas-turmas/:path*",
    "/painel",
    "/minhas-atividades/:path*",
    "/historico",
    "/meus-feedbacks",
  ],
};
