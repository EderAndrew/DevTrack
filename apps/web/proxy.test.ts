import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"), cookie ? { headers: { cookie } } : undefined);

describe("proxy (UX only)", () => {
  it("covers only the signed-in areas", () => {
    expect(config.matcher).toEqual([
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
    ]);
  });

  it("without the session cookie redirects to /entrar with next", () => {
    const res = proxy(request("/conta/sessoes"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/entrar?next=%2Fconta%2Fsessoes");
  });

  it("also covers the admin area", () => {
    const res = proxy(request("/admin/managers"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/entrar?next=%2Fadmin%2Fmanagers");
  });

  it("with a session cookie lets the request through (the API decides validity)", () => {
    const res = proxy(request("/conta/sessoes", "__Host-devtrack_session=qualquer"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
